# AvtoTexnik — Avto Servis va Texnik Nazorat

Avto texnika xizmatlari uchun mobil-moslashuvchan PWA ilova, moy va ehtiyot qismlar eslatmalari, mijoz shaxsiy kabineti, servis tarixi hamda ko‘p bosqichli xavfsizlik protokollari bilan himoyalangan sirli admin panel.

## Tezkor ishga tushirish (Windows)

1. Papka ichidagi **`start.bat`** faylini ikki marta bosing (u avtomatik kutubxonalarni o‘rnatadi, serverni yoqadi va brauzerda `http://localhost:3000` ni ochadi).

Yoki terminal orqali:
```bash
npm install
npm run dev
```
So‘ng brauzerda **`http://localhost:3000`** manzilini oching *(Windows’da `0.0.0.0:3000` o‘rniga har doim `localhost:3000` ishlating)*.

> **Talab:** Node.js **22.14+** (`node:sqlite` bazasi uchun).

## Sirli Admin Paneliga kirish

- **Ochish usullari:** Istalgan sahifaning o‘ng pastki burchagidagi ko‘rinmas tugma, sayt pastidagi `© 2026 AvtoTexnik` matnini **3 marta** bosish yoki `Ctrl + Shift + A`.
- **Boshlang‘ich ma’lumotlar** *(panel ichida almashtirish mumkin)*:
  - Operator ID: `AT-ADMIN-01`
  - Master PIN: `482910`
  - Xavfsizlik frazasi: `KARDAN-770`
