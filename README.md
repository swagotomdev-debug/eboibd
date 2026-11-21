# eboibd.site - প্রিমিয়াম ইবুক সেলিং প্ল্যাটফর্ম

একটি আধুনিক, দ্রুতগতির, মোবাইল-ফার্স্ট ইবুক প্ল্যাটফর্ম। সাইটটি খাঁটি বাংলায় (Anek Bangla ও Hind Siliguri ফন্ট), ভ্যানিলা এইচটিএমএল/সিএসএস/জাভাস্ক্রিপ্ট এবং সুপাবেস (Supabase) ও জিনিপে (ZiniPay) স্বয়ংক্রিয় গেটওয়ের মাধ্যমে পরিচালিত।

---

## 🛠️ সেটআপ ও ডিপ্লয়মেন্ট নির্দেশিকা (Step-by-Step)

সাইটটি লাইভ করার জন্য নিচের সহজ ধাপগুলো অনুসরণ করুন:

### ১. Supabase প্রজেক্ট তৈরি করুন (Create Supabase Project)
- [Supabase](https://supabase.com)-এ যান এবং একটি নতুন প্রজেক্ট তৈরি করুন।
- প্রজেক্টের **Project Settings -> API** থেকে `Project URL`, `anon public key` এবং `service_role secret` কপি করে রাখুন।

### ২. ডাটাবেস SQL স্ক্রিপ্ট রান করুন (Run SQL)
- Supabase ড্যাশবোর্ডের বাম পাশের মেনু থেকে **SQL Editor**-এ যান।
- এই রিপোজিটরির `supabase/schema.sql` ফাইলের পুরো কোডটি কপি করে পেস্ট করুন এবং **Run** বাটনে চাপুন।
- এটি স্বয়ংক্রিয়ভাবে `books`, `orders`, `reviews`, `admins` টেবিল, ইউনিক ইনডেক্স (`orders.gateway_ref`), RLS পলিসি, পাবলিক RPC ও ভিউ এবং `covers` ও `ebooks` স্টোরেজ বাকেট তৈরি করে ৪টি বই সিড করে দেবে।

### ৩. অ্যাডমিন ইউজার তৈরি করুন (Create Admin User)
- Supabase ড্যাশবোর্ডের **Authentication -> Users**-এ যান।
- **Add user -> Create user**-এ ক্লিক করে আপনার অ্যাডমিন ইমেইল (যেমন: `team@eboibd.site`) এবং একটি শক্তিশালী পাসওয়ার্ড দিয়ে একাউন্ট তৈরি করুন।
- নিশ্চিত করুন এই ইমেইলটি `admins` টেবিলে উপস্থিত রয়েছে (SQL স্ক্রিপ্টে এটি ডিফল্টভাবে যুক্ত করা আছে)।
- **Authentication -> Providers -> Email**-এ গিয়ে "Enable Sign Up" অপশনটি বন্ধ (Disable) করে দিন, যাতে আপনি ছাড়া অন্য কেউ একাউন্ট খুলতে না পারে।

### ৪. "ebooks" বাকেটে বইয়ের PDF আপলোড করুন (Upload PDFs)
- Supabase ড্যাশবোর্ডের **Storage** মেনুতে যান।
- প্রাইভেট বাকেট `ebooks`-এ গিয়ে আপনার ৪টি বইয়ের মূল PDF ফাইল আপলোড করুন:
  - `ai-income.pdf`
  - `freelancer-payment.pdf`
  - `facebook-business.pdf`
  - `ai-video-editing.pdf`
*(নোট: এই বাকেটটি সম্পূর্ণ প্রাইভেট। কোনো ভিজিটর সরাসরি ফাইল লিংক দেখতে পারবে না; শুধুমাত্র সফল পেমেন্টের পর এজ ফাংশন ১০ মিনিটের সাইনড ডাউনলোড লিংক দেবে)*।

### ৫. Supabase সিক্রেট কি সেট করুন (Set Secrets)
টার্মিনালে আপনার Supabase প্রজেক্ট লিংক করুন এবং এজ ফাংশনের জন্য প্রয়োজনীয় সিক্রেটগুলো সেট করুন:
```bash
npx supabase login
npx supabase link --project-ref <your-supabase-project-ref>

# সিক্রেট এনভায়রনমেন্ট ভেরিয়েবল সেট করুন
npx supabase secrets set ZINIPAY_API_KEY="your_actual_zinipay_api_key"
npx supabase secrets set SITE_URL="https://eboibd.site"
npx supabase secrets set MAIL_FROM="team@eboibd.site"
npx supabase secrets set RESEND_API_KEY="re_optional_key_if_using_resend"
```

### ৬. এজ ফাংশনগুলো ডিপ্লয় করুন (Deploy Functions with Supabase CLI)
টার্মিনাল থেকে ৪টি এজ ফাংশন ডিপ্লয় করুন:
```bash
npx supabase functions deploy create-payment --no-verify-jwt
npx supabase functions deploy verify-payment --no-verify-jwt
npx supabase functions deploy download --no-verify-jwt
npx supabase functions deploy submit-review --no-verify-jwt
```

### ৭. ZiniPay ব্র্যান্ড ও অ্যাকাউন্ট সেটআপ (Set up ZiniPay Brand)
- [ZiniPay](https://zinipay.com) মার্চেন্ট ড্যাশবোর্ডে লগইন করুন।
- ব্র্যান্ডের ওয়েবসাইট URL হিসেবে `https://eboibd.site` সেট করুন।
- আপনার Brand API Key টি কপি করে ধাপ ৫-এ দেওয়া সিক্রেটে যুক্ত করুন।
- ZiniPay-তে Webhook URL দিন:
  `https://<your-project-ref>.supabase.co/functions/v1/verify-payment`

### ৮. ওয়েবসাইট লাইভ আপলোড করুন (Upload the Site)
- `assets/js/config.js` ফাইলে আপনার Supabase URL ও anon key বসান।
- সাইটের সমস্ত ফাইল Vercel, Cloudflare Pages, Netlify বা আপনার নিজস্ব হোস্টিং সার্ভারে আপলোড করুন।
  - *Vercel ব্যবহার করলে রুট ফোল্ডারে টার্মিনালে `vercel --prod` দিলেই ক্লিন URL সহ স্বয়ংক্রিয়ভাবে সাইট লাইভ হয়ে যাবে।*

### ৯. একটি আসল ক্রয় টেস্ট করুন (Test One Real Purchase)
- লাইভ সাইটে প্রবেশ করুন (যেমন: `/books/ai-income`)।
- "এখনই কিনুন" বাটনে চাপ দিয়ে চেকআউটে আপনার নাম, ইমেইল ও ১১ ডিজিটের মোবাইল নম্বর দিন।
- ZiniPay গেটওয়েতে বিকাশ/নগদে পেমেন্ট সম্পন্ন করুন।
- পেমেন্ট সম্পন্ন হলে সাইট আপনাকে স্বয়ংক্রিয়ভাবে `/success.html?order=...` পেজে নিয়ে যাবে, যেখানে সার্ভার-ভেরিফাইড ডাউনলোড বাটন ও রিভিউ ফর্ম দেখতে পাবেন।
- ডাউনলোড বাটনে চাপ দিয়ে নিশ্চিত হোন যে সুরক্ষিত PDF ফাইলটি ১০ মিনিটের সাইনড লিংকের মাধ্যমে ডাউনলোড হচ্ছে।
- `/admin` এ প্রবেশ করে লগইন করুন এবং ড্যাশবোর্ডে নতুন সেলস, রেভিনিউ এবং অর্ডারের স্ট্যাটাস যাচাই করুন।

---

## 💻 লোকাল টেস্ট রান (Local Development)
লোকাল পিসিতে সাইটটি রান করতে:
```bash
python3 -m http.server 8080
```
ব্রাউজারে প্রবেশ করুন: `http://localhost:8080/`
- হোমপেজ: [http://localhost:8080/](http://localhost:8080/)
- বইয়ের ল্যান্ডিং পেজ: [http://localhost:8080/books/ai-income/](http://localhost:8080/books/ai-income/)
- চেকআউট: [http://localhost:8080/checkout/?book=ai-income](http://localhost:8080/checkout/?book=ai-income)
- অ্যাডমিন ড্যাশবোর্ড: [http://localhost:8080/admin/](http://localhost:8080/admin/)
  *(লোকাল ডেমো লগইন: `admin@eboibd.site` / পাসওয়ার্ড: `admin123`)*

---

## 📞 সাপোর্ট
- ইমেইল: [team@eboibd.site](mailto:team@eboibd.site)
- হোয়াটসঅ্যাপ: [০১৫৪০৭৩৭২০৫](https://wa.me/8801540737205)
