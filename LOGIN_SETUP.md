# Login Configuration Guide

## Prerequisites

Before you can log in locally, you need to configure your Supabase project to allow your local development URL.

## Steps to Enable Local Authentication

### 1. Go to Supabase Dashboard
Visit [https://supabase.com/dashboard](https://supabase.com/dashboard) and sign in to your account.

### 2. Select Your Project
Click on your project (`ctrkencemjucdkbxeisf`) or the one you're using.

### 3. Configure Redirect URLs
Navigate to:
- **Authentication** → **URL Configuration**

### 4. Add Your Local URL
In the **Redirect URLs** section, add:
- `http://localhost:8080`
- `http://localhost:8080/auth`
- `http://localhost:8080/chat`

### 5. Add Site URL
In the **Site URL** field, set:
- `http://localhost:8080`

### 6. Save Changes
Click **Save** to apply the configuration.

## Testing the Login

Once configured, you can:

1. **Create a new account** by clicking "Sign up" on the auth page
2. **Sign in** with your email and password
3. **Use Google OAuth** by clicking "Continue with Google"

## Common Issues

### CORS Error: "Access to fetch has been blocked by CORS policy"
**Solution:** Make sure you've added `http://localhost:8080` to your Supabase URL Configuration as described above.

### "Invalid login credentials"
**Solution:** Check that your email and password are correct. For new accounts, you may need to confirm your email first (unless auto-confirmation is enabled).

### "Session not established after sign-in"
**Solution:** This indicates a temporary sync issue. Try again—the session should be created and persisted automatically on successful sign-in.

## Environment Variables

Your `.env` file should already contain:
```
VITE_SUPABASE_URL=https://ctrkencemjucdkbxeisf.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-key>
```

These are automatically used by the Supabase client.
