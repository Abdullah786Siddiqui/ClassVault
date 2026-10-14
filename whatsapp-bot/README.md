# 🤖 ClassVault WhatsApp Bot Bridge

Automatic background listener that captures photos and document files (PDFs, slides, images) from your university and class WhatsApp groups and uploads them directly into your **ClassVault** subjects in Google Drive!

---

## 🌟 Everything Managed Inside ClassVault Web App

You do not need to scan QR codes inside the command line or manually edit JSON files:
1. **In-App QR Scanning**: Inside the ClassVault app, click the **WhatsApp** icon in the top header or mobile navigation bar. The QR code appears directly on your screen.
2. **Mobile Scan**: Open WhatsApp on your phone -> Settings (or 3 dots menu) -> **Linked Devices** -> **Link a Device** -> Scan the QR code on your screen.
3. **Dynamic Group-to-Subject Mapping**: WhatsApp group names and ClassVault subject names can be completely different! Use the in-app dropdowns to map any WhatsApp group (e.g. `BSCS Fall 2024 Math Section A`) to its exact ClassVault Semester, Exam, and Subject (e.g. `Semester 1 / Midterm / Calculus`).

---

## 🚀 Quick Start Guide

### Step 1: Install Dependencies (First time only)
In your terminal, navigate to the `whatsapp-bot` folder:
```bash
cd whatsapp-bot
npm install
```

### Step 2: Start the Bridge Server
```bash
npm start
```
The bridge server starts on `http://localhost:4848` and communicates with the ClassVault Web App.

### Step 3: Open ClassVault App
1. Open the ClassVault web app in your browser (`http://localhost:5173` or your hosted URL).
2. Click the green **WhatsApp** icon in the header.
3. Scan the displayed QR Code using your phone.
4. Switch to the **Group Mappings** tab, map your active WhatsApp groups to their respective Subjects, and click **Save All Mappings**!

---

## 📁 Google Drive Auto-Upload (Optional / Recommended)
If you want files uploaded straight to Google Drive in real time:
- Run `npm run auth-drive` to authorize your Google account, OR
- Place your Service Account `credentials.json` directly into this folder.
*(Even without Google Drive configured, all files will be automatically backed up locally in the `./downloads/` folder).*
