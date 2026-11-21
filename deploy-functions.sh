#!/usr/bin/env bash
# ==============================================================================
# eboibd.site - Supabase Edge Functions Deployment Helper Script
# ==============================================================================

set -e

echo "=================================================="
echo "   eboibd.site - Supabase Edge Functions Deploy   "
echo "=================================================="

# 1. Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
  echo ""
  echo "⚠️ Supabase CLI ইনস্টল করা নেই।"
  echo "ইনস্টল করতে নিচের যেকোনো একটি পদ্ধতি ব্যবহার করুন:"
  echo ""
  echo "পদ্ধতি ১ (Linux সবচেয়ে সহজ - ১ কমান্ড):"
  echo "  curl -fsSL https://raw.githubusercontent.com/supabase/cli/main/install/install.sh | sh"
  echo "  sudo mv bin/supabase /usr/local/bin/"
  echo ""
  echo "পদ্ধতি ২ (যদি Node.js/npm থাকে):"
  echo "  npm install -g supabase"
  echo ""
  exit 1
fi

echo "✓ Supabase CLI পাওয়া গেছে: $(supabase --version)"
echo ""

# 2. Check login
echo "📌 ধাপ ১: Supabase লগইন যাচাই..."
supabase login

# 3. Project Link
echo ""
echo "📌 ধাপ ২: প্রজেক্ট রেফারেন্স আইডি দিয়ে লিংক করুন:"
read -p "আপনার Project Reference ID [ডিফল্ট: aixhmugoxwtwenishcfe]: " USER_REF
PROJECT_REF="${USER_REF:-aixhmugoxwtwenishcfe}"

supabase link --project-ref "$PROJECT_REF"

# 4. Set Secrets
echo ""
echo "📌 ধাপ ৩: সিক্রেট কী (Secrets) সেট করা..."
read -p "আপনার ZiniPay API Key দিন: " ZINI_KEY

if [ -n "$ZINI_KEY" ]; then
  supabase secrets set ZINIPAY_API_KEY="$ZINI_KEY" SITE_URL="https://eboibd.site" MAIL_FROM="team@eboibd.site"
  echo "✓ Secrets সফলভাবে সেট হয়েছে।"
else
  echo "⚠️ ZiniPay API Key এড়িয়ে যাওয়া হয়েছে (পরে 'supabase secrets set ZINIPAY_API_KEY=...' দিয়ে সেট করতে পারেন)।"
fi

# 5. Deploy the 4 functions
echo ""
echo "📌 ধাপ ৪: এজ ফাংশনগুলো ডিপ্লয় করা হচ্ছে..."

echo "1/4 Deploying create-payment..."
supabase functions deploy create-payment --no-verify-jwt

echo "2/4 Deploying verify-payment..."
supabase functions deploy verify-payment --no-verify-jwt

echo "3/4 Deploying download..."
supabase functions deploy download --no-verify-jwt

echo "4/4 Deploying submit-review..."
supabase functions deploy submit-review --no-verify-jwt

echo ""
echo "🎉 অভিনন্দন! ৪টি এজ ফাংশন সফলভাবে ডিপ্লয় সম্পন্ন হয়েছে!"
echo "আপনার ফাংশনগুলোর লাইভ URL:"
echo "👉 https://${PROJECT_REF}.supabase.co/functions/v1/create-payment"
echo "👉 https://${PROJECT_REF}.supabase.co/functions/v1/verify-payment"
echo "👉 https://${PROJECT_REF}.supabase.co/functions/v1/download"
echo "👉 https://${PROJECT_REF}.supabase.co/functions/v1/submit-review"
echo "=================================================="
