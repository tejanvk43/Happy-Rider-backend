# Backend Setup & Integration Guide

## 📋 Overview

The backend is built with **Express.js** and **Supabase**, handling all onboarding data persistence, KYC document management, and vehicle information storage.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Update `backend/.env` with your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_public_xxxxx
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
NODE_ENV=development
PORT=3000
```

**Get Service Role Key:**
1. Go to Supabase Dashboard → Settings → API → Service Role Secret
2. Copy the key and paste it as `SUPABASE_SERVICE_ROLE_KEY`

### 3. Run Database Migrations

Create database tables:

```bash
node migrations/runMigrations.js
```

Or manually run SQL in Supabase:
1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `migrations/001_initial_schema.sql`
3. Execute in the editor

### 4. Start Backend Server

```bash
npm run dev
```

Expected output:
```
✓ Happi Riders backend running on http://localhost:3000
✓ Environment: development
```

## 🔌 Firebase Admin (Phone Verification)

If you want backend verification of Firebase ID tokens, provide your Firebase service account JSON to the backend as a base64-encoded environment variable.

1. Go to Firebase Console → Project Settings → Service Accounts → Generate new private key
2. Base64-encode the JSON file contents (on Windows use PowerShell):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('serviceAccountKey.json')) > serviceAccountKey.json.b64
```

3. Add to `backend/.env`:

```
FIREBASE_SERVICE_ACCOUNT_JSON=<contents of serviceAccountKey.json.b64>
```

4. The backend exposes `POST /api/onboarding/firebase-verify` which accepts JSON `{ idToken, phoneNumber }`. The endpoint verifies the Firebase ID token and upserts the driver record in Supabase.


## 📱 Frontend Integration

### Configure API Base URL

In your React Native app, set the API base URL in `.env` or as environment variable:

```env
REACT_APP_API_URL=http://localhost:3000/api
```

Or for production:
```env
REACT_APP_API_URL=https://your-production-api.com/api
```

### Update onboardingStore.ts

The store now includes API integration. Example usage:

```typescript
import * as api from '../api/client';

// Submit phone number
const response = await api.submitPhoneNumber(phoneNumber);

// Save personal details
await api.savePersonalDetails(phoneNumber, {
  fullName: 'John Doe',
  email: 'john@example.com',
  // ...
});
```

## 🔌 API Endpoints

### Onboarding Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/onboarding/phone` | Submit phone number |
| POST | `/api/onboarding/account` | Create account |
| POST | `/api/onboarding/personal-details` | Save personal info |
| POST | `/api/onboarding/service-selection` | Select service type |
| GET | `/api/onboarding/driver/:phoneNumber` | Get driver status |
| POST | `/api/onboarding/complete` | Mark onboarding complete |

### KYC Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/kyc/upload` | Upload KYC document |
| POST | `/api/kyc/details` | Save KYC details (numbers) |
| GET | `/api/kyc/driver/:phoneNumber` | Get KYC status |
| POST | `/api/kyc/vehicle-details` | Save vehicle details |

### Health Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check |
| GET | `/api/health/db` | Database health check |

## 📊 Database Schema

### drivers table
```
- id (UUID, PK)
- phone (VARCHAR UNIQUE)
- username (VARCHAR UNIQUE)
- password (VARCHAR)
- full_name, email, gender, dob, address, city, pincode
- emergency_contact, emergency_contact_relationship, referral_code
- selected_service, sub_service
- onboarding_status
- created_at, updated_at
```

### driver_kyc table
```
- id (UUID, PK)
- driver_id (UUID, FK → drivers.id)
- aadhaar_number, pan_number, license_number
- profile_photo_doc_uri, aadhaar_doc_uri, pan_doc_uri, license_doc_uri, faceScan_doc_uri
- Document statuses: 'empty', 'uploaded', 'verified'
- insurance_consent (BOOLEAN)
- kyc_status ('pending', 'verified', 'rejected')
- created_at, updated_at
```

### vehicles table
```
- id (UUID, PK)
- driver_id (UUID, FK → drivers.id)
- company, model, purchase_date, fuel_type, ownership_type
- owner_name, owner_relationship, owner_aadhaar_number
- rc_number, chassis_number
- insurance_name, insurance_number, pucc_expiry_date
- Document URIs for RC, Insurance, PUCC, Fitness
- verification_status
- created_at, updated_at
```

### audit_log table
```
- id (UUID, PK)
- driver_id (UUID, FK)
- action (VARCHAR)
- table_name, record_id
- old_values, new_values (JSONB)
- ip_address, user_agent
- created_at
```

## 🔐 Security Notes

1. **Never commit `.env` file** - Add to `.gitignore`
2. **Service Role Key** - Keep secure, only use on backend
3. **Row Level Security (RLS)** - Configure Supabase RLS policies for frontend client
4. **Password Hashing** - Update to use `bcrypt` instead of base64 in production
5. **CORS** - Configure in `.env` for your frontend domains

## 🐛 Troubleshooting

### "Missing Supabase credentials"
- Check `.env` file has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Verify keys are correct from Supabase dashboard

### "Database connection failed"
- Verify Supabase project is active
- Check network connectivity
- Review Supabase project status page

### "API returns 403"
- May need to configure Supabase RLS policies
- Verify Service Role Key has correct permissions

### Frontend cannot reach backend
- Ensure backend is running on correct port (default 3000)
- Check `REACT_APP_API_URL` is correctly set
- For mobile/emulator, use machine IP instead of `localhost`

## 📈 Next Steps

1. **Configure Supabase Storage** for document file uploads
2. **Implement Supabase Auth** for user authentication
3. **Add RLS policies** for row-level security
4. **Set up file signing** for secure document URLs
5. **Add admin dashboard** for verification

## 📝 Example Usage

```typescript
// Complete onboarding flow
async function completeOnboarding(phoneNumber: string) {
  try {
    // 1. Save personal details
    await api.savePersonalDetails(phoneNumber, {
      fullName: 'John Doe',
      email: 'john@example.com',
      dob: '15/05/1995',
      // ...
    });

    // 2. Save KYC details
    await api.saveKycDetails(phoneNumber, {
      aadhaarNumber: '123456789012',
      panNumber: 'ABCDE0000F',
      licenseNumber: 'DL0000000000',
      insuranceConsent: true,
    });

    // 3. Upload documents
    await api.uploadKycDocument(phoneNumber, 'faceScan', faceScanUri);
    await api.uploadKycDocument(phoneNumber, 'aadhaar', aadhaarUri);

    // 4. Save vehicle details
    await api.saveVehicleDetails(phoneNumber, {
      company: 'Mahindra',
      model: 'XUV500',
      rcNumber: 'DL01AB0123',
      // ...
    });

    // 5. Mark as complete
    await api.completeOnboarding(phoneNumber);

    console.log('Onboarding completed successfully!');
  } catch (error) {
    console.error('Onboarding failed:', error);
  }
}
```
