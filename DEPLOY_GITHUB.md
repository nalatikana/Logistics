# คู่มือย้ายระบบขึ้น GitHub และเปิดดูจากที่อื่น

โปรเจกต์นี้มี 2 ส่วน:

- Frontend: ไฟล์ใน `public/` เปิดผ่าน GitHub Pages ได้
- Backend/API: `server.js` ต้องรันบน Node host เช่น Render, Railway, VPS หรือเครื่อง server

ถ้าต้องการให้ใช้งานได้ครบทุกปุ่ม แนะนำใช้ Render สำหรับทั้งเว็บและ API เพราะ Node server ตัวนี้เสิร์ฟหน้า `/web` และ `/mobile` ได้พร้อมกัน

## วิธีที่ 1: Deploy แบบครบระบบบน Render

1. สร้าง repository ใหม่ใน GitHub
2. อัปโหลดไฟล์โปรเจกต์นี้ขึ้น GitHub
3. เข้า Render แล้วเลือก `New Web Service`
4. Connect repository นี้
5. Render จะอ่านไฟล์ `render.yaml` ให้อัตโนมัติ
6. กด Deploy

หลัง Deploy จะได้ลิงก์ประมาณ:

- `https://ชื่อโปรเจกต์.onrender.com/web`
- `https://ชื่อโปรเจกต์.onrender.com/mobile`

ข้อดี: ใช้งาน API, import CSV, ออกใบ Cargo, upload รูป, dashboard ได้ครบกว่า GitHub Pages

## วิธีที่ 2: เปิดหน้าเว็บด้วย GitHub Pages

วิธีนี้ใช้สำหรับดูหน้าเว็บ static เป็นหลัก ถ้าต้องการให้ปุ่มต่าง ๆ ทำงาน ต้องมี backend URL จาก Render ก่อน

1. Deploy backend บน Render ให้ได้ URL ก่อน
2. แก้ไฟล์ `public/config.js`

```js
window.SMART_LOGISTICS_API_BASE = "https://ชื่อโปรเจกต์.onrender.com";
```

3. Push ขึ้น GitHub branch `main`
4. ไปที่ GitHub repository > Settings > Pages
5. เลือก Source เป็น `GitHub Actions`
6. รอ workflow `Deploy static frontend to GitHub Pages` ทำงานเสร็จ

ลิงก์ GitHub Pages จะเปิดได้ประมาณ:

- `https://username.github.io/repository-name/`
- `https://username.github.io/repository-name/mobile.html`

## ไฟล์ที่ไม่ควรอัปโหลดขึ้น GitHub

ไฟล์ `.gitignore` กันไว้แล้ว:

- `data/db.json` เพราะอาจมีข้อมูลลูกค้า/เที่ยวบินจริง
- `storage/` เพราะเป็นรูปและเอกสารแนบจากหน้างาน
- `.env` เพราะอาจมี webhook หรือ secret

ถ้าต้องการใช้ข้อมูลตัวอย่างใหม่ ให้ปล่อยให้ server สร้าง `data/db.json` เองตอนรันครั้งแรก

## คำสั่งทดสอบก่อนอัปโหลด

```powershell
npm start
```

แล้วเปิด:

- `http://localhost:3000/web`
- `http://localhost:3000/mobile`

## คำสั่ง Git พื้นฐาน

```powershell
git init
git add .
git commit -m "Initial SmartLogistics web app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

ถ้าเครื่องยังไม่มี Git ให้ติดตั้ง Git for Windows ก่อน
