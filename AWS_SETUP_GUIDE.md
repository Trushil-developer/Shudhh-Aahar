# 🔐 AWS + Google Sign-In Setup Guide

Complete step-by-step to get auth + database working.
Estimated time: ~45 minutes first time.

---

## PART 1 — Google OAuth Setup (15 min)

### Step 1: Create Google OAuth Credentials
1. Go to https://console.cloud.google.com
2. Create a new project → name it "Shuddh Aahar"
3. Go to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth Client ID**
5. Choose **iOS** → enter bundle ID: `com.yourname.shuddhaahar`
6. Click **Create** → copy the **Client ID**
7. Repeat for **Android** → enter package name: `com.shuddhaahar`
8. Copy both Client IDs — you'll need them in Step 3

---

## PART 2 — AWS Setup (20 min)

### Step 2: Create AWS Account
- Go to https://aws.amazon.com → create free account
- Free tier covers everything you need for this app
- **DynamoDB free tier**: 25GB storage + 200M requests/month — more than enough

### Step 3: Install & Configure Amplify CLI
```bash
npm install -g @aws-amplify/cli
amplify configure
```
Follow prompts → log in with your AWS account → create an IAM user.

### Step 4: Init Amplify in your project
```bash
cd Shuddhaahar
amplify init
```
Answer the prompts:
- Name: `shuddhaahar`
- Environment: `dev`
- Default editor: your choice
- App type: `javascript`
- Framework: `react-native`
- Source dir: `.`
- Build dir: `.`
- Start command: `npx react-native start`
- Build command: leave blank

### Step 5: Add Authentication (Cognito + Google)
```bash
amplify add auth
```
Choose:
- Default configuration with Social Provider (Federation)
- Sign in: **Email**
- Social providers: **Google**
- Paste your **Google Web Client ID** and **Secret** from Step 1
- Redirect URIs: `shuddhaahar://`

### Step 6: Add Database (AppSync + DynamoDB)
```bash
amplify add api
```
Choose:
- **GraphQL**
- Authorization: **Amazon Cognito User Pool**
- Do you have a schema? **Yes**
- Path: paste path to `amplify/backend/api/shuddhaahar/schema.graphql`

### Step 7: Deploy everything to AWS
```bash
amplify push
```
This creates:
- ✅ Cognito User Pool (auth)
- ✅ DynamoDB tables (User, ScanHistory)
- ✅ AppSync API (GraphQL endpoint)
- ✅ Auto-generates `aws-exports.js` with your real config values

---

## PART 3 — React Native Setup (10 min)

### Step 8: Install all dependencies
```bash
npm install
```

### Step 9: iOS setup
```bash
cd ios && pod install && cd ..
```

Add to `ios/Shuddhaahar/Info.plist`:
```xml
<key>NSCameraUsageDescription</key>
<string>Shuddh Aahar needs camera access to scan barcodes.</string>

<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>shuddhaahar</string>
    </array>
  </dict>
</array>
```

### Step 10: Android setup
Add to `android/app/src/main/AndroidManifest.xml` inside `<manifest>`:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.INTERNET" />
```

Add inside `<activity>`:
```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="shuddhaahar" />
</intent-filter>
```

### Step 11: Run the app
```bash
# Android
npx react-native run-android

# iOS
npx react-native run-ios
```

---

## 💰 AWS Cost Estimate

| Service | Free Tier | After Free Tier |
|---|---|---|
| DynamoDB | 25GB + 200M requests/month | ~$1.25 per million requests |
| Cognito | 50,000 MAU free | $0.0055 per MAU |
| AppSync | 250K queries/month | $4 per million queries |

**For a small app with <1,000 users → essentially FREE forever.**

---

## 🗄️ What Gets Stored in DynamoDB

### User Table
| Field | Example |
|---|---|
| id | Google user ID |
| email | user@gmail.com |
| name | John Smith |
| healthProfile.allergies | ["Peanuts", "Milk"] |
| healthProfile.conditions | ["Type 2 Diabetes"] |
| healthProfile.medications | [{name: "Metformin", dosage: "500mg"}] |
| healthProfile.dietType | "Vegan" |
| healthProfile.healthGoals | ["Reduce Sugar"] |

### ScanHistory Table
| Field | Example |
|---|---|
| userId | Google user ID |
| barcode | 5000112652879 |
| productName | Coca-Cola |
| warnings | ["⚠️ High sugar — diabetic alert"] |
| cheapestStore | ASDA |
| cheapestPrice | 0.89 |

---

## 🔒 Privacy & Security Notes

- All health data is encrypted at rest in DynamoDB
- Only the logged-in user can read/write their own data (Cognito owner rules)
- Data never leaves AWS eu-west-2 (London region)
- You should add a Privacy Policy before launching publicly
