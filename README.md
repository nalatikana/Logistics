# Smart Logistics Tracking

ระบบต้นแบบสำหรับงาน Pickup, Inbound WH3, Outbound Terminal, Billing และ Dashboard แบบ Mobile-Web/PWA เปิดใน VS Code แล้วรันได้ทันทีด้วย Node.js ล้วน ไม่ต้องติดตั้ง package เพิ่มในรอบแรก

## วิธีรัน

วิธีง่ายสุด: เปิดไฟล์ `Start-SmartLogistics.cmd`

หรือรันจาก VS Code Terminal:

```powershell
node server.js
```

จากนั้นเปิด:

- Web app สำหรับคอม: `http://localhost:3000/web`
- Mobile app สำหรับมือถือ/พนักงาน: `http://localhost:3000/mobile`

ทั้งสองลิงก์ใช้ API และข้อมูลชุดเดียวกันจาก `data/db.json`

ถ้าต้องใช้ Node ที่ bundled มากับ Codex:

```powershell
& 'C:\Users\UsEr\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' server.js
```

## โครงสร้าง

- `server.js` - Web API, mock database, file storage, alert webhook
- `public/` - PWA หน้าเว็บมือถือและ Dashboard
- `data/db.json` - ฐานข้อมูลจำลองที่ระบบสร้างให้อัตโนมัติเมื่อรันครั้งแรก
- `storage/` - ไฟล์ภาพ/เอกสารที่ upload จาก Base64
- `docs/schema.sql` - schema สำหรับ PostgreSQL/MySQL-style relational database

## Role และหน้าจอ

- Driver: เช็คอิน, เปิดกล้อง, บีบอัดรูปด้วย Canvas, เก็บ GPS, ลายเซ็น
- WH_Staff: Twin-scanning ระหว่าง `House_Number` และ `Location_ID`
- Terminal: validation เอกสารลิเธียม, X-Ray, Re-X-Ray alert, Loading Detail
- Billing: สร้าง draft invoice, เปิดเอกสาร invoice HTML, mock ส่งอีเมลวางบิล
- Admin: เปิดใบงานใหม่, import flight feed แบบ CSV, dashboard, alert
- Executive: dashboard, KPI, red flag 4 ชั่วโมงก่อน flight, invoice overview

## ทดลอง Flow ทั้งระบบ

1. เลือก role `แอดมิน` แล้วเปิดใบงานใหม่ หรือกด `Import งานจาก Email/CSV`
2. เลือก role `คนขับ` ใส่ House Number แล้วกดเช็คอิน/จบงาน
3. เลือก role `WH3` สแกน House + Location เพื่อล็อกตำแหน่ง
4. เลือก role `Terminal` ตรวจเอกสาร, กด X-Ray ผ่าน แล้วอัปโหลด Loading Detail
5. เลือก role `บัญชี` สร้างใบแจ้งหนี้ เปิดเอกสาร แล้วกดส่งอีเมลวางบิล
6. เลือก role `ผู้บริหาร` เพื่อดูภาพรวมงาน, alert, invoice และสถานะเสี่ยงก่อน flight 4 ชั่วโมง

## Module 1: Pickup จากคลังลูกค้า

ตอนนี้ระบบรองรับรายละเอียด Module 1 แล้ว:

- แอดมินเลือกกรณีงาน `งานพิเศษ/MD รับฟอร์มจาก WH3` หรือ `งานทั่วไป คนขับเขียนเอง`
- กรอก Cargo Pickup Form หลัก เช่น วันที่รับสินค้า, ลูกค้า, สถานที่รับ, คนขับ, ทะเบียนรถ, จำนวนสินค้า, ประเภทแพ็ค, Destination และสี Sticker
- คนขับเปิดหน้า `/mobile` เพื่อเช็คอิน, ถ่ายรูปสินค้า/ใบ Cargo, เก็บ GPS, ลงลายเซ็น และจบงาน
- Dashboard/Order Tracking ฝั่ง `/web` เห็นสถานะและรายละเอียด Pickup เดียวกันจากข้อมูลชุดเดียวกัน

## SCD Pickup Report Import

หน้า `/web` > `ระบบ / Admin` รองรับการนำเข้าไฟล์ `Air_Export_Global_Pickup_Report___SCD...csv`

Mapping หลัก:

- `ONHAND` -> Job ID / fallback House
- `HAWB` -> House Number ถ้าเป็นเลขจริง, ถ้าเป็น `AIR` จะใช้ `ONHAND`
- `DEST` -> Destination airport
- `PICKUP` -> Customer/Shipper
- `PHONE` -> Pickup phone
- `CONTACT_PERSON` -> Contact person
- `OWNER` -> Owner
- `CARRIER` -> Carrier
- `QTY` -> จำนวนสินค้า / Piece count
- `WEIGHT` -> Weight
- `READY` -> Pickup ready time
- `CLOSE` -> Pickup close time
- `Address` -> สถานที่รับสินค้า / Pickup location
- `REFS#` -> Reference numbers

เมื่อ import แล้ว ระบบจะสร้าง/อัปเดตใบงานแบบ `AdminPrepared` เพื่อให้คนขับเลือกจาก `Assigned Job` ในหน้า `/mobile` แล้วระบบเติมข้อมูลลูกค้า ต้นทาง ปลายทาง จำนวน และรายการ House ให้อัตโนมัติ

## Production Next Steps

1. เปลี่ยน `data/db.json` เป็น PostgreSQL/MySQL หรือ Google Sheets
2. เปลี่ยน `storage/` เป็น Google Drive หรือ S3
3. ตั้งค่า `LINE_WEBHOOK_URL` สำหรับแจ้งเตือนหัวหน้างาน/บัญชี
4. เพิ่ม auth จริง แยกสิทธิ์ตาม role
5. เปลี่ยน import CSV เป็น cron job อ่านอีเมลทุก 2 ชั่วโมงเพื่อ upsert `jobs_master`
6. เปลี่ยน invoice HTML เป็น PDF generator จริง เช่น Google Docs Template หรือ Playwright PDF

## ข้อควรระวังที่ใส่ไว้ใน design

- Timestamp ฝั่ง API เก็บเป็น ISO/UTC และแปลงเป็นเวลาไทยเฉพาะตอนแสดงผล
- Logic twin-scan ใน production ต้องใช้ transaction หรือ lock ตามตัวอย่างใน `docs/schema.sql`
- Frontend บีบอัดภาพก่อนส่ง API เพื่อลดปัญหาเน็ตช้า
- Service worker cache ไฟล์หน้าเว็บพื้นฐาน เพื่อเตรียมต่อยอด offline queue ด้วย IndexedDB
