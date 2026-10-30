-- Pictures drawn before the viewer grabbed with a margin clip the outline;
-- forget them so admins' visits draw them again.
UPDATE versions SET renders = '';
