//! Getting your data back out.
//!
//! Writing happens through these commands rather than the filesystem plugin so
//! that no directory scope has to be granted to the webview. Every path here
//! comes from a save dialog the user just clicked through, and nothing else on
//! disk is reachable.
//!
//! The database backup is deliberately *not* here: SQLite runs in WAL mode, so
//! copying the file would miss anything still in the write-ahead log. That one
//! goes through `VACUUM INTO`, which writes a consistent single-file copy.

use serde::Deserialize;
use std::path::{Path, PathBuf};

/// One file in an exported bundle.
#[derive(Deserialize)]
pub struct ExportFile {
    name: String,
    contents: String,
}

/// Insist on a plain file name. Bundle names are built from note titles, so
/// this is what stops a note called `../../.ssh/authorized_keys` from writing
/// anywhere except the folder the user picked.
///
/// Note what is *not* rejected: a `..` inside the name. With both separators
/// banned and a leading dot banned, `..` can no longer name a parent directory
/// — it is just two characters. Refusing it as well would fail an export
/// wholesale over a note honestly titled "Wait.. what?".
fn validate_name(name: &str) -> Result<(), String> {
    let ok = !name.is_empty()
        && name.len() <= 200
        && !name.starts_with('.')
        && !name.contains('/')
        && !name.contains('\\')
        && !name.chars().any(char::is_control);
    if ok {
        Ok(())
    } else {
        Err(format!("unsafe file name: {name}"))
    }
}

fn validate_dest(path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    if !p.is_absolute() {
        return Err("destination must be an absolute path".into());
    }
    Ok(p.to_path_buf())
}

/// Write a single file — the whole-workspace JSON export.
#[tauri::command]
pub fn export_write_file(path: String, contents: String) -> Result<(), String> {
    let dest = validate_dest(&path)?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&dest, contents).map_err(|e| format!("couldn't write {}: {e}", dest.display()))
}

/// Write a folder of files — the Markdown bundle. Returns how many landed.
#[tauri::command]
pub fn export_write_bundle(dir: String, files: Vec<ExportFile>) -> Result<usize, String> {
    let root = validate_dest(&dir)?;
    // Check every name before writing any, so one bad title fails the export
    // outright instead of leaving a half-filled folder behind.
    for f in &files {
        validate_name(&f.name)?;
    }
    std::fs::create_dir_all(&root)
        .map_err(|e| format!("couldn't create {}: {e}", root.display()))?;
    for f in &files {
        std::fs::write(root.join(&f.name), &f.contents)
            .map_err(|e| format!("couldn't write {}: {e}", f.name))?;
    }
    Ok(files.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_names_that_could_leave_the_folder() {
        for bad in [
            "../escape.md",
            "..",
            "../../.ssh/authorized_keys",
            "sub/dir.md",
            "windows\\path.md",
            ".hidden.md",
            "",
        ] {
            assert!(validate_name(bad).is_err(), "should have rejected {bad:?}");
        }
    }

    #[test]
    fn accepts_names_a_note_title_really_produces() {
        for good in [
            "Ideas.md",
            "Ideas (2).md",
            "Wait.. what-.md",
            "Q3 planning - draft.md",
            "café ☕.md",
        ] {
            assert!(validate_name(good).is_ok(), "should have accepted {good:?}");
        }
    }

    /// The separator ban is what contains a name; joining can't escape without it.
    #[test]
    fn validated_names_stay_under_the_root() {
        let root = Path::new("/tmp/export-root");
        for name in ["Wait.. what-.md", "a..b.md"] {
            validate_name(name).expect("name should be valid");
            assert!(root.join(name).starts_with(root));
        }
    }
}
