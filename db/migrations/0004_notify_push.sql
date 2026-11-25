-- Each person chooses how they're notified: email, text message, and now push (the iPhone app).
-- Push defaults on, like email; it only reaches phones where the app is installed and allowed.
ALTER TABLE users ADD COLUMN notify_push boolean NOT NULL DEFAULT true;
