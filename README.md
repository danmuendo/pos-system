# POS System with M-Pesa Integration

Point of Sale system built with React, Node.js, and PostgreSQL, with support for M-Pesa and cash sales, receipt printing/reprint, role-based access, product categories, barcode/SKU scan flow, and management reports.

## Current Features

- Product management with image upload
- Category management (structured categories per business)
- Barcode/SKU support for faster checkout
- POS checkout for:
  - M-Pesa STK push
  - Cash sales
- Receipt flow:
  - Auto-open receipt for cash sales
  - Reprint from transaction history
  - Printable receipt page
- Business profile customization:
  - Business name, phone, address, tax PIN
  - Receipt footer
  - Business logo upload/remove
- Transaction history with details
- Void/refund for completed sales (owner/admin)
- Shift close report
- Product performance report (top-selling + low-margin)
- Low stock alerts
- Staff account management (owner/admin)
- Audit logging for critical actions

## Tech Stack

### Frontend
- React 18
- React Router DOM
- Axios
- CSS3

### Backend
- Node.js
- Express
- PostgreSQL
- JWT authentication
- bcrypt
- multer (image uploads)
- M-Pesa Daraja API

## Prerequisites

- Node.js v14+
- PostgreSQL v12+
- M-Pesa Daraja credentials (for M-Pesa flow)

## Installation

### 1. Clone

```bash
git clone <repository-url>
cd pos-system
```

### 2. Database setup

Create database:

```bash
psql -U postgres
CREATE DATABASE pos_db;
\q
```

Apply base schema:

```bash
psql -U postgres -d pos_db -f backend/database/schema.sql
```

If your DB was created before recent features, apply migration scripts:

```bash
psql -U postgres -d pos_db -f backend/database/security_integrity_migration.sql
psql -U postgres -d pos_db -f backend/database/add_business_profile_fields.sql
psql -U postgres -d pos_db -f backend/database/add_categories_table.sql
psql -U postgres -d pos_db -f backend/database/add_product_barcode.sql
psql -U postgres -d pos_db -f backend/database/add_product_cost_price.sql
```

### 3. Backend setup

```bash
cd backend
npm install
```

Create `.env` (example values):

```env
PORT=5000
NODE_ENV=development

DB_USER=postgres
DB_HOST=localhost
DB_NAME=pos_db
DB_PASSWORD=your_password
DB_PORT=5432

JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=8h

MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_SHORTCODE=174379
MPESA_PASSKEY=your_passkey
MPESA_CALLBACK_URL=https://yourdomain.com/api/transactions/mpesa-callback
MPESA_ENVIRONMENT=sandbox
```

Run backend:

```bash
npm run dev
```

### 4. Frontend setup

```bash
cd frontend
npm install
```

Create `.env`:

```env
REACT_APP_API_URL=http://localhost:5000/api
```

Run frontend:

```bash
npm start
```

App URL: `http://localhost:3000`

## Usage Notes

- First account registration is bootstrap-only (open registration is disabled after first user).
- Owner/admin can create staff accounts.
- Cash checkout auto-opens receipt page.
- Transaction history supports receipt reprint.
- Barcode/SKU input in POS checkout supports scanner workflow (scan then Enter).
- Product performance report requires `cost_price` on products for margin calculations.

## API Endpoints (Current)

### Auth
- `POST /api/auth/register` - Bootstrap first account
- `POST /api/auth/login`
- `POST /api/auth/change-password`
- `GET /api/auth/users` - List staff (owner/admin)
- `POST /api/auth/users` - Create staff (owner/admin)
- `PUT /api/auth/users/:id` - Update staff (owner/admin)
- `DELETE /api/auth/users/:id` - Delete staff (owner/admin)
- `GET /api/auth/business-profile`
- `PUT /api/auth/business-profile` (owner/admin)
- `POST /api/auth/upload-logo` (owner/admin)
- `DELETE /api/auth/logo` (owner/admin)

### Products
- `GET /api/products`
- `GET /api/products/low-stock`
- `POST /api/products` (owner/admin)
- `PUT /api/products/:id` (owner/admin)
- `DELETE /api/products/:id` (owner/admin)
- `POST /api/products/upload-image` (owner/admin)
- `GET /api/products/categories`
- `POST /api/products/categories` (owner/admin)
- `PUT /api/products/categories/:id` (owner/admin)
- `DELETE /api/products/categories/:id` (owner/admin)

### Transactions
- `POST /api/transactions/checkout`
- `POST /api/transactions/mpesa-callback` (public callback route)
- `POST /api/transactions/:id/complete`
- `POST /api/transactions/:id/void` (owner/admin)
- `POST /api/transactions/:id/refund` (owner/admin)
- `GET /api/transactions`
- `GET /api/transactions/:id`
- `GET /api/transactions/:id/receipt`
- `GET /api/transactions/reports/shift-close` (owner/admin)
- `GET /api/transactions/reports/product-performance` (owner/admin)

## Project Structure

```text
pos-system/
├── backend/
│   ├── config/
│   ├── database/
│   │   ├── schema.sql
│   │   ├── security_integrity_migration.sql
│   │   ├── add_business_profile_fields.sql
│   │   ├── add_categories_table.sql
│   │   ├── add_product_barcode.sql
│   │   └── add_product_cost_price.sql
│   ├── middleware/
│   ├── routes/
│   │   ├── auth.js
│   │   ├── products.js
│   │   └── transactions.js
│   ├── services/
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── App.js
│   │   └── index.js
│   └── package.json
└── README.md
```

## Troubleshooting

### Reprint opens login page
- Ensure login was done after latest auth persistence update.
- Session now uses storage fallback, but old session state may require logout/login.

### M-Pesa callback issues
- Confirm callback URL is publicly reachable.
- For local dev, use ngrok and update `MPESA_CALLBACK_URL`.

### Missing report data
- Product performance margin requires product `cost_price`.
- Shift close and performance reports depend on completed sale transactions in selected date range.

### Barcode scan not finding products
- Check product has barcode set in Product Management.
- Scan input expects exact barcode value (scanner usually appends Enter).

## Security Notes

- Set a strong `JWT_SECRET`
- Never commit `.env` files
- Use HTTPS in production
- Restrict and monitor admin/owner access
- Add rate limiting and stronger input validation for production hardening

## License

MIT
