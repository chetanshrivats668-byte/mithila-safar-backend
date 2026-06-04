import os

file_path = r'c:\Users\jigar\OneDrive\Documents\BookNow\server.js'

header = """import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, query, orderBy, where } from 'firebase/firestore';

// ========== FIREBASE CONFIG (from .env) ==========
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
console.log('🔥 Firebase connected');

const app = express();
const PORT = process.env.PORT || 3001;
const ROOT_DIR = process.cwd();
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

// ========== IN-MEMORY STORES & CONFIG ==========
const otpStore = new Map();
const OTP_MAX_ATTEMPTS = 3;
const apiRateLimits = new Map();
const loginAttempts = new Map();
const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const API_RATE_WINDOW = 15 * 60 * 1000;
const LOCKOUT_TIME = 15 * 60 * 1000;

function checkAdminLoginRateLimit(ip) {
  const attempt = loginAttempts.get(ip);
  if (!attempt) return { allowed: true, remaining: ADMIN_LOGIN_MAX_ATTEMPTS };
  if (attempt.count >= ADMIN_LOGIN_MAX_ATTEMPTS && Date.now() - attempt.lastAttempt < LOCKOUT_TIME) {
"""

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# The current file's line 4 is '    return { allowed: false, remaining: 0 };'
# which is the INSIDE of checkAdminLoginRateLimit.
# So we can replace everything before that with our header.

# Find where '    return { allowed: false, remaining: 0 };' is
mangled_start_index = -1
for i, line in enumerate(lines):
    if 'return { allowed: false, remaining: 0 };' in line:
        mangled_start_index = i
        break

if mangled_start_index != -1:
    new_content = header + "".join(lines[mangled_start_index:])
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully restored server.js header")
else:
    print("Could not find mangled point")
