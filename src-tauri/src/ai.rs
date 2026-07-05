//! Bring-your-own-key AI assistant.
//!
//! API keys live in the OS keychain (macOS Keychain, Windows Credential
//! Manager, Linux Secret Service) and never reach the webview after entry.
//! All provider HTTP calls happen here in Rust, so the strict frontend CSP
//! stays closed and the key is never exposed to page JavaScript.

use serde_json::{json, Value};
use std::time::Duration;

const KEYRING_SERVICE: &str = "com.thinkstack.app";
const MAX_PROMPT_CHARS: usize = 100_000;

fn validate_provider(provider: &str) -> Result<(), String> {
    match provider {
        "anthropic" | "openai" => Ok(()),
        _ => Err("unknown AI provider".into()),
    }
}

fn entry(provider: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, &format!("ai-key-{provider}")).map_err(|e| e.to_string())
}

/// Store an API key for a provider in the OS keychain.
#[tauri::command]
pub fn ai_set_key(provider: String, key: String) -> Result<(), String> {
    validate_provider(&provider)?;
    let trimmed = key.trim();
    if trimmed.is_empty() || trimmed.len() > 512 {
        return Err("invalid API key".into());
    }
    entry(&provider)?
        .set_password(trimmed)
        .map_err(|e| e.to_string())
}

/// Whether a key is stored for the provider (the key itself is never returned).
#[tauri::command]
pub fn ai_has_key(provider: String) -> Result<bool, String> {
    validate_provider(&provider)?;
    Ok(entry(&provider)?.get_password().is_ok())
}

/// Remove the stored key for a provider.
#[tauri::command]
pub fn ai_clear_key(provider: String) -> Result<(), String> {
    validate_provider(&provider)?;
    match entry(&provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Friendly message for common HTTP failures, falling back to the provider's
/// own error message when present.
fn api_error(status: reqwest::StatusCode, body: &Value) -> String {
    let detail = body["error"]["message"].as_str().unwrap_or_default();
    match status.as_u16() {
        401 => "Invalid API key — check it in Settings.".into(),
        403 => "This API key doesn't have access to that model.".into(),
        404 => "Unknown model — check the model name in Settings.".into(),
        429 => "Rate limited by the provider — try again in a moment.".into(),
        529 | 503 => "The AI service is overloaded — try again shortly.".into(),
        _ if !detail.is_empty() => detail.into(),
        code => format!("AI request failed (HTTP {code})"),
    }
}

async fn complete_anthropic(
    client: &reqwest::Client,
    key: &str,
    model: &str,
    system: &str,
    prompt: &str,
) -> Result<String, String> {
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .json(&json!({
            "model": model,
            "max_tokens": 2048,
            "system": system,
            "messages": [{ "role": "user", "content": prompt }],
        }))
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    let status = resp.status();
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(api_error(status, &body));
    }

    // Concatenate text blocks; thinking/other block types have no `text`.
    let text = body["content"]
        .as_array()
        .map(|blocks| {
            blocks
                .iter()
                .filter(|b| b["type"] == "text")
                .filter_map(|b| b["text"].as_str())
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();
    if text.is_empty() {
        return Err("The model returned no text.".into());
    }
    Ok(text)
}

async fn complete_openai(
    client: &reqwest::Client,
    key: &str,
    model: &str,
    system: &str,
    prompt: &str,
) -> Result<String, String> {
    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(key)
        .json(&json!({
            "model": model,
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": prompt },
            ],
        }))
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    let status = resp.status();
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(api_error(status, &body));
    }

    let text = body["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or_default();
    if text.is_empty() {
        return Err("The model returned no text.".into());
    }
    Ok(text.to_string())
}

/// Run one completion against the configured provider using the stored key.
#[tauri::command]
pub async fn ai_complete(
    provider: String,
    model: String,
    system: String,
    prompt: String,
) -> Result<String, String> {
    validate_provider(&provider)?;
    if model.trim().is_empty() || model.len() > 128 {
        return Err("invalid model name".into());
    }
    if prompt.is_empty() || prompt.len() > MAX_PROMPT_CHARS {
        return Err("prompt is empty or too long".into());
    }
    let key = entry(&provider)?
        .get_password()
        .map_err(|_| "No API key saved — add one in Settings.".to_string())?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    match provider.as_str() {
        "anthropic" => complete_anthropic(&client, &key, &model, &system, &prompt).await,
        _ => complete_openai(&client, &key, &model, &system, &prompt).await,
    }
}
