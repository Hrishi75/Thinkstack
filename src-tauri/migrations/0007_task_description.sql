-- Optional free-form details under a task's title.
ALTER TABLE tasks ADD COLUMN description TEXT NOT NULL DEFAULT '';
