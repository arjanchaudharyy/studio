# Clerk JWT Token Configuration

## Token Expiration

Clerk tokens expire every 60 seconds by design for security. However, you can configure a custom JWT template with longer expiration times.

## Configuring JWT Template Expiration

1. **Go to Clerk Dashboard**: https://dashboard.clerk.com
2. **Navigate to**: JWT Templates → Create or Edit Template
3. **Set Token Lifetime**: 
   - Default: 60 seconds
   - Recommended for development: 3600 seconds (1 hour)
   - Recommended for production: 3600-7200 seconds (1-2 hours)

4. **Set the template name** in your environment variables:
   ```bash
   VITE_CLERK_JWT_TEMPLATE=your-template-name
   ```

## Current Configuration

The frontend uses the JWT template specified in `VITE_CLERK_JWT_TEMPLATE` environment variable.

If no template is specified, Clerk uses the default 60-second expiration.

## Token Refresh

The application automatically refreshes tokens every 30 seconds to prevent expiration issues. This is handled by:
- `frontend/src/auth/providers/clerk-provider.tsx` - Automatic refresh every 30 seconds
- Clerk's `getToken()` method automatically handles token refresh when needed

## Alternative: Force Refresh

If you need to force a token refresh manually, you can use:
```typescript
const token = await getToken({ skipCache: true });
```

## Security Note

While longer token expiration is convenient for development, keep in mind:
- Shorter expiration times (60 seconds) provide better security
- The automatic refresh mechanism handles this seamlessly
- Production should use reasonable expiration times (1-2 hours max)

