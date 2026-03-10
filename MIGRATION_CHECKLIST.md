# WordPress to PostgreSQL User Migration Checklist

Use this checklist to ensure a smooth migration process.

## 📋 Pre-Migration Phase

### Environment Setup
- [ ] Node.js and npm installed
- [ ] All dependencies installed (`npm install`)
- [ ] TypeScript working (`npx tsc --version`)
- [ ] ts-node installed and working

### Database Access
- [ ] WordPress MySQL database accessible
- [ ] WordPress database credentials confirmed
- [ ] PostgreSQL database accessible
- [ ] PostgreSQL connection string working
- [ ] Can connect to both databases from migration machine

### Configuration
- [ ] `.env` file created (from `.env.migration.example`)
- [ ] `DATABASE_URL` configured correctly
- [ ] `WP_DB_HOST` configured
- [ ] `WP_DB_USER` configured
- [ ] `WP_DB_PASSWORD` configured
- [ ] `WP_DB_NAME` configured (u758272264_NW_DB)
- [ ] `WP_DB_PORT` configured (default: 3306)

### Prisma Setup
- [ ] `schema.prisma` matches User model requirements
- [ ] Prisma Client generated (`npx prisma generate`)
- [ ] Prisma migrations applied to PostgreSQL
- [ ] Can create test users in PostgreSQL

### Backups
- [ ] PostgreSQL database backed up
- [ ] Backup restore process tested
- [ ] WordPress database backed up (optional, for safety)

### Testing Environment
- [ ] Development/staging environment available
- [ ] Test migration on dev environment first
- [ ] Verified test migration successful

## 🔍 Data Analysis Phase

### WordPress Data Review
- [ ] Count total users in WordPress
  ```sql
  SELECT COUNT(*) FROM wp_users WHERE deleted = 0 AND spam = 0;
  ```
- [ ] Identify spam/deleted users to exclude
- [ ] Check for duplicate emails
- [ ] Review user roles distribution
- [ ] Analyze common user meta keys
- [ ] Identify custom fields needed

### PostgreSQL Schema Review
- [ ] User table exists
- [ ] All required fields present
- [ ] Email field is unique
- [ ] Role enum includes all needed roles (ADMIN, VENDOR, BUYER, SUB_ADMIN)
- [ ] Optional fields are nullable
- [ ] Default values configured

## 🚀 Migration Execution Phase

### Pre-Run Checks
- [ ] Reviewed migration script
- [ ] Understand field mappings
- [ ] Password strategy decided:
  - [ ] Force password reset
  - [ ] Lazy migration
  - [ ] Random passwords with email
- [ ] Error handling understood
- [ ] Rollback plan ready

### Run Migration
- [ ] Run migration script: `npm run migrate:users`
- [ ] Monitor console output for errors
- [ ] Note any error messages
- [ ] Record migration statistics

### Expected Output Verification
```
✅ Should see: "Connecting to WordPress database..."
✅ Should see: "Found X users"
✅ Should see: "Migrated: username → User ID X"
✅ Should see: "Migration Summary" with statistics
```

## ✅ Post-Migration Verification Phase

### Data Integrity Checks
- [ ] Count migrated users in PostgreSQL
  ```sql
  SELECT COUNT(*) FROM "User" WHERE "authProvider" = 'wordpress';
  ```
- [ ] Compare counts with WordPress
- [ ] Verify no duplicate emails
- [ ] Check sample user data accuracy
- [ ] Verify all roles mapped correctly
- [ ] Check first/last names populated
- [ ] Verify email addresses correct
- [ ] Check phone numbers (if applicable)

### Detailed Sample Verification
- [ ] Pick 5-10 random WordPress users
- [ ] Find them in PostgreSQL by email
- [ ] Compare field by field:
  - [ ] Name/username
  - [ ] Email
  - [ ] First name
  - [ ] Last name
  - [ ] Phone
  - [ ] Role
  - [ ] Registration date
  - [ ] Active status

### Query Verification
```sql
-- Find a specific migrated user
SELECT * FROM "User" 
WHERE email = 'test@example.com' 
  AND "authProvider" = 'wordpress';

-- Count by role
SELECT role, COUNT(*) 
FROM "User" 
WHERE "authProvider" = 'wordpress'
GROUP BY role;

-- Check for missing required fields
SELECT * FROM "User" 
WHERE "authProvider" = 'wordpress'
  AND (email IS NULL OR password IS NULL);
```

## 🔐 Password Handling Phase

### Password Reset Strategy
If using force password reset:
- [ ] Password reset email template prepared
- [ ] Email sending service configured
- [ ] Password reset flow tested
- [ ] Send password reset emails to all migrated users
- [ ] Monitor email delivery
- [ ] Track password reset completion rate

If using lazy migration:
- [ ] `wordpress-hash-node` package installed
- [ ] Password verification implemented in auth service
- [ ] Password upgrade logic implemented
- [ ] Tested with sample WordPress password

If using random passwords:
- [ ] Random password generator implemented
- [ ] Email template with new password prepared
- [ ] Passwords sent to users
- [ ] Delivery confirmed

## 🔗 Related Data Migration

### User-Related Data (if applicable)
- [ ] User addresses migrated
- [ ] User orders migrated
- [ ] User reviews migrated
- [ ] User wishlist items migrated
- [ ] User notifications migrated
- [ ] User sessions cleared/recreated

## 🎯 Application Updates

### Code Updates
- [ ] Authentication updated for migrated users
- [ ] Password verification handles WordPress hashes (if lazy migration)
- [ ] User profile pages display correctly
- [ ] User role permissions work correctly
- [ ] Email validation/verification flow updated

### Testing
- [ ] Can view migrated user profiles
- [ ] Migrated users can log in (with new password)
- [ ] User roles work correctly
- [ ] User data displays properly in UI
- [ ] User can update their profile
- [ ] User permissions enforced correctly

## 📊 Monitoring Phase

### First 24 Hours
- [ ] Monitor for authentication issues
- [ ] Track password reset requests
- [ ] Monitor error logs
- [ ] Check for duplicate account complaints
- [ ] Verify email deliverability

### First Week
- [ ] Track user login success rate
- [ ] Monitor for data issues reported by users
- [ ] Check for missing data complaints
- [ ] Verify user satisfaction

## 📝 Documentation Phase

### Record Keeping
- [ ] Document migration date and time
- [ ] Record number of users migrated
- [ ] Note any issues encountered
- [ ] Document any data anomalies
- [ ] Save migration logs
- [ ] Update system documentation

### Team Communication
- [ ] Notify team of migration completion
- [ ] Share migration statistics
- [ ] Document any known issues
- [ ] Provide support contact info
- [ ] Share troubleshooting guide

## 🔄 Rollback Plan (If Needed)

### Rollback Checklist
- [ ] Stop application
- [ ] Restore PostgreSQL from backup
- [ ] Verify backup restoration
- [ ] Test application with restored data
- [ ] Document reason for rollback
- [ ] Plan corrective actions

## ✨ Success Criteria

Migration is successful when:
- [ ] All non-spam/deleted WordPress users migrated
- [ ] User data accurate in PostgreSQL
- [ ] Users can authenticate (after password reset)
- [ ] User roles work correctly
- [ ] No duplicate accounts
- [ ] No data loss
- [ ] Application functions normally
- [ ] Users can access their accounts
- [ ] Support team has no major issues to resolve

## 📞 Emergency Contacts

Document your contacts:
- **Database Admin**: ___________________
- **DevOps Lead**: ___________________
- **Project Manager**: ___________________
- **On-Call Developer**: ___________________

## 📈 Migration Statistics Template

Fill in after migration:

```
Migration Date: ___________________
Migration Duration: ___________________

WordPress Users (Total): ___________________
Active Users (non-spam/deleted): ___________________

PostgreSQL Results:
- Successfully Migrated: ___________________
- Skipped (Already Exist): ___________________
- Errors: ___________________

Roles Distribution:
- ADMIN: ___________________
- VENDOR: ___________________
- BUYER: ___________________
- SUB_ADMIN: ___________________

Issues Encountered: ___________________
Resolution: ___________________

Sign-off: ___________________
```

---

**Ready to Start?** Begin with the Pre-Migration Phase and check off items as you go! 🚀
