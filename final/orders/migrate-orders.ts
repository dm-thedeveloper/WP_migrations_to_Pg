/**
 * WordPress Orders to PostgreSQL Migration
 * Direct PostgreSQL connection (NOT Prisma)
 * Preserves WordPress IDs and handles all relationships
 */

import mysql from "mysql2/promise";
import { Client } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

// WordPress MySQL configuration
const wpConfig = {
  host: process.env.WP_DB_HOST || "srv447.hstgr.io",
  user: process.env.WP_DB_USER || "u758272264_NW_DB",
  password: process.env.WP_DB_PASSWORD || "Aeiou@123",
  database: process.env.WP_DB_NAME || "u758272264_NW_DB",
  port: parseInt(process.env.WP_DB_PORT || "3306"),
};

// PostgreSQL configuration (AWS)
const pgConfig = {
  host: "13.60.17.42",
  port: 5432,
  user: "adminuser",
  password: "Vgvguy766%^&FuuvD",
  database: "wordpress_migration_db",
};

interface MigrationStats {
  totalOrders: number;
  mainOrdersCreated: number;
  ordersCreated: number;
  addressesCreated: number;
  orderItemsCreated: number;
  paymentsCreated: number;
  skipped: number;
  errors: number;
}

class OrderMigration {
  private wpConnection!: mysql.Connection;
  private pgClient!: Client;
  private stats: MigrationStats = {
    totalOrders: 0,
    mainOrdersCreated: 0,
    ordersCreated: 0,
    addressesCreated: 0,
    orderItemsCreated: 0,
    paymentsCreated: 0,
    skipped: 0,
    errors: 0,
  };

  // Cache for metadata
  private orderMeta: Map<number, Record<string, string>> = new Map();
  private dokanOrders: Map<number, any[]> = new Map();
  private deliveryTimes: Map<number, any[]> = new Map();
  private orderItems: Map<number, any[]> = new Map();
  private itemMeta: Map<number, Record<string, string>> = new Map();

  async connect() {
    console.log("🔌 Connecting to WordPress MySQL...");
    this.wpConnection = await mysql.createConnection(wpConfig);
    console.log("✅ WordPress connected\n");

    console.log("🔌 Connecting to PostgreSQL (AWS)...");
    this.pgClient = new Client(pgConfig);
    await this.pgClient.connect();
    console.log("✅ PostgreSQL connected\n");
  }

  async disconnect() {
    if (this.wpConnection) await this.wpConnection.end();
    if (this.pgClient) await this.pgClient.end();
  }

  // =====================================================
  // PHASE 0: Create Tables and Enums
  // =====================================================

  async createTablesAndEnums() {
    console.log("📋 Phase 0: Creating tables and enums in PostgreSQL...\n");

    // Create OrderStatus enum if not exists
    await this.pgClient.query(`
      DO $$ BEGIN
        CREATE TYPE "OrderStatus" AS ENUM (
          'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 
          'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log("  ✅ OrderStatus enum verified");

    // Create PaymentMethod enum if not exists
    await this.pgClient.query(`
      DO $$ BEGIN
        CREATE TYPE "PaymentMethod" AS ENUM (
          'CARD', 'THOKMANDEE_PAY', 'BACS', 'STRIPE', 'CHEQUE'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log("  ✅ PaymentMethod enum verified");

    // Create PaymentStatus enum if not exists
    await this.pgClient.query(`
      DO $$ BEGIN
        CREATE TYPE "PaymentStatus" AS ENUM (
          'PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log("  ✅ PaymentStatus enum verified");

    // Create MainOrder table
    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS "MainOrder" (
        id SERIAL PRIMARY KEY,
        "mainOrderNumber" TEXT NOT NULL UNIQUE,
        total DECIMAL(10,2) NOT NULL DEFAULT 0,
        "userId" INTEGER NOT NULL REFERENCES "User"(id),
        status "OrderStatus" NOT NULL DEFAULT 'PENDING',
        notes TEXT,
        "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CARD',
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log("  ✅ MainOrder table verified");

    // Create Order table
    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS "Order" (
        id INTEGER PRIMARY KEY,
        "orderNumber" TEXT NOT NULL UNIQUE,
        total DECIMAL(10,2) NOT NULL DEFAULT 0,
        status "OrderStatus" NOT NULL DEFAULT 'PENDING',
        notes TEXT,
        "mainOrderId" INTEGER REFERENCES "MainOrder"(id),
        "userId" INTEGER NOT NULL REFERENCES "User"(id),
        "vendorId" INTEGER NOT NULL REFERENCES "User"(id),
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log("  ✅ Order table verified");

    // Create orderAddress table
    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS "orderAddress" (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES "User"(id),
        "orderId" INTEGER NOT NULL UNIQUE REFERENCES "Order"(id),
        "fullName" TEXT,
        email TEXT,
        phone TEXT,
        country TEXT,
        address TEXT,
        "zipCode" TEXT,
        city TEXT
      )
    `);
    console.log("  ✅ orderAddress table verified");

    // Create OrderItem table
    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS "OrderItem" (
        id SERIAL PRIMARY KEY,
        "wordpressItemId" INTEGER,
        "productId" INTEGER REFERENCES "Product"(id),
        "productName" TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        price DECIMAL(10,2) NOT NULL DEFAULT 0,
        subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
        "variationId" INTEGER,
        "variationAttributes" TEXT,
        sku TEXT,
        "orderId" INTEGER NOT NULL REFERENCES "Order"(id),
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log("  ✅ OrderItem table verified");

    // Create Payment table
    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS "Payment" (
        id SERIAL PRIMARY KEY,
        amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        method "PaymentMethod" NOT NULL DEFAULT 'CARD',
        status "PaymentStatus" NOT NULL DEFAULT 'PENDING',
        "orderId" INTEGER NOT NULL REFERENCES "MainOrder"(id),
        "userId" INTEGER REFERENCES "User"(id),
        "stripePaymentIntent" TEXT UNIQUE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log("  ✅ Payment table verified");

    // Add missing columns to Payment if table already existed
    try {
      await this.pgClient.query(
        `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "userId" INTEGER REFERENCES "User"(id)`
      );
      await this.pgClient.query(
        `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "stripePaymentIntent" TEXT UNIQUE`
      );
    } catch (e) {
      // Columns may already exist
    }

    // Fix Payment.orderId FK if it references Order instead of MainOrder
    try {
      await this.pgClient.query(
        `ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_orderId_fkey"`
      );
      await this.pgClient.query(
        `ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MainOrder"(id)`
      );
    } catch (e) {
      // Constraint may already be correct
    }

    // Create indexes
    await this.pgClient.query(`
      CREATE INDEX IF NOT EXISTS idx_mainorder_userid ON "MainOrder"("userId");
      CREATE INDEX IF NOT EXISTS idx_order_mainorderid ON "Order"("mainOrderId");
      CREATE INDEX IF NOT EXISTS idx_order_userid ON "Order"("userId");
      CREATE INDEX IF NOT EXISTS idx_order_vendorid ON "Order"("vendorId");
      CREATE INDEX IF NOT EXISTS idx_orderitem_orderid ON "OrderItem"("orderId");
      CREATE INDEX IF NOT EXISTS idx_orderitem_productid ON "OrderItem"("productId");
      CREATE INDEX IF NOT EXISTS idx_payment_orderid ON "Payment"("orderId");
    `);
    console.log("  ✅ Indexes created\n");
  }

  // =====================================================
  // PHASE 1: Create Extra Columns
  // =====================================================

  async createExtraColumns() {
    console.log("📋 Phase 1: Creating extra columns in PostgreSQL...\n");

    // Extra columns for Order table
    const orderColumns = [
      { name: "wordpressOrderKey", type: "TEXT" },
      { name: "invoiceNumber", type: "TEXT" },
      { name: "deliveryDate", type: "TEXT" },
      { name: "deliveryTimeSlot", type: "TEXT" },
      { name: "deliveryType", type: "TEXT" },
      { name: "commissionRate", type: "DECIMAL(10,2)" },
      { name: "netAmount", type: "DECIMAL(10,2)" },
      { name: "shippingTotal", type: "DECIMAL(10,2)" },
      { name: "taxTotal", type: "DECIMAL(10,2)" },
      { name: "cartDiscount", type: "DECIMAL(10,2)" },
    ];

    for (const col of orderColumns) {
      try {
        await this.pgClient.query(`
          ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}
        `);
      } catch (e) {
        // Column may already exist
      }
    }
    console.log("  ✅ Order table columns verified");

    // Extra columns for orderAddress table
    const addressColumns = [
      { name: "company", type: "TEXT" },
      { name: "address2", type: "TEXT" },
      { name: "state", type: "TEXT" },
      { name: "vatNumber", type: "TEXT" },
    ];

    for (const col of addressColumns) {
      try {
        await this.pgClient.query(`
          ALTER TABLE "orderAddress" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}
        `);
      } catch (e) {
        // Column may already exist
      }
    }
    console.log("  ✅ orderAddress table columns verified");

    // Extra columns for Payment table
    const paymentColumns = [
      { name: "transactionId", type: "TEXT" },
      { name: "stripeFee", type: "DECIMAL(10,2)" },
      { name: "stripeNet", type: "DECIMAL(10,2)" },
      { name: "stripeCustomerId", type: "TEXT" },
      { name: "userId", type: 'INTEGER REFERENCES "User"(id)' },
      { name: "stripePaymentIntent", type: "TEXT" },
      { name: "currency", type: "TEXT" },
      { name: "paymentMethod", type: "TEXT" },
      { name: "metadata", type: "JSONB" },
    ];

    for (const col of paymentColumns) {
      try {
        await this.pgClient.query(`
          ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}
        `);
      } catch (e) {
        // Column may already exist
      }
    }
    console.log("  ✅ Payment table columns verified\n");
  }

  // =====================================================
  // PHASE 2: Fetch WordPress Data
  // =====================================================

  async fetchWordPressData() {
    console.log("📋 Phase 2: Fetching WordPress data...\n");

    // Fetch all shop_order posts
    console.log("  📊 Fetching orders...");
    const [orders] = await this.wpConnection.query<mysql.RowDataPacket[]>(`
      SELECT 
        p.ID as order_id,
        p.post_author,
        p.post_date,
        p.post_date_gmt,
        p.post_content as customer_note,
        p.post_title,
        p.post_status,
        p.post_modified,
        p.post_modified_gmt,
        p.post_parent,
        p.post_password as order_key,
        p.comment_count
      FROM wp_posts p
      WHERE p.post_type = 'shop_order'
      ORDER BY p.ID ASC
    `);
    this.stats.totalOrders = orders.length;
    console.log(`  ✅ Found ${orders.length} orders`);

    // Fetch order metadata
    console.log("  📊 Fetching order metadata...");
    const [orderMetaRows] = await this.wpConnection.query<
      mysql.RowDataPacket[]
    >(`
      SELECT post_id, meta_key, meta_value
      FROM wp_postmeta
      WHERE post_id IN (SELECT ID FROM wp_posts WHERE post_type = 'shop_order')
    `);

    for (const row of orderMetaRows) {
      if (!this.orderMeta.has(row.post_id)) {
        this.orderMeta.set(row.post_id, {});
      }
      this.orderMeta.get(row.post_id)![row.meta_key] = row.meta_value;
    }
    console.log(`  ✅ Loaded metadata for ${this.orderMeta.size} orders`);

    // Fetch Dokan vendor orders
    console.log("  📊 Fetching Dokan vendor orders...");
    try {
      const [dokanRows] = await this.wpConnection.query<mysql.RowDataPacket[]>(`
        SELECT id, order_id, seller_id, order_total, net_amount, order_status
        FROM wp_dokan_orders
        ORDER BY order_id
      `);

      for (const row of dokanRows) {
        if (!this.dokanOrders.has(row.order_id)) {
          this.dokanOrders.set(row.order_id, []);
        }
        this.dokanOrders.get(row.order_id)!.push(row);
      }
      console.log(`  ✅ Found ${dokanRows.length} Dokan vendor orders`);
    } catch (e) {
      console.log(
        "  ⚠️  wp_dokan_orders table not found - will use single vendor mode"
      );
    }

    // Fetch delivery times
    console.log("  📊 Fetching delivery times...");
    try {
      const [deliveryRows] = await this.wpConnection.query<
        mysql.RowDataPacket[]
      >(`
        SELECT order_id, seller_id, delivery_date, delivery_time_slot, delivery_type
        FROM wp_dokan_delivery_time
      `);

      for (const row of deliveryRows) {
        if (!this.deliveryTimes.has(row.order_id)) {
          this.deliveryTimes.set(row.order_id, []);
        }
        this.deliveryTimes.get(row.order_id)!.push(row);
      }
      console.log(`  ✅ Found ${deliveryRows.length} delivery schedules`);
    } catch (e) {
      console.log("  ⚠️  wp_dokan_delivery_time table not found");
    }

    // Fetch order items
    console.log("  📊 Fetching order items...");
    const [itemRows] = await this.wpConnection.query<mysql.RowDataPacket[]>(`
      SELECT order_item_id, order_id, order_item_name, order_item_type
      FROM wp_woocommerce_order_items
      WHERE order_item_type = 'line_item'
      ORDER BY order_id, order_item_id
    `);

    for (const row of itemRows) {
      if (!this.orderItems.has(row.order_id)) {
        this.orderItems.set(row.order_id, []);
      }
      this.orderItems.get(row.order_id)!.push(row);
    }
    console.log(`  ✅ Found ${itemRows.length} order items`);

    // Fetch order item meta
    console.log("  📊 Fetching order item metadata...");
    const [itemMetaRows] = await this.wpConnection.query<
      mysql.RowDataPacket[]
    >(`
      SELECT oim.order_item_id, oim.meta_key, oim.meta_value
      FROM wp_woocommerce_order_itemmeta oim
      WHERE oim.order_item_id IN (
        SELECT order_item_id FROM wp_woocommerce_order_items WHERE order_item_type = 'line_item'
      )
    `);

    for (const row of itemMetaRows) {
      if (!this.itemMeta.has(row.order_item_id)) {
        this.itemMeta.set(row.order_item_id, {});
      }
      this.itemMeta.get(row.order_item_id)![row.meta_key] = row.meta_value;
    }
    console.log(`  ✅ Loaded item metadata\n`);

    return orders;
  }

  // =====================================================
  // Helper Functions
  // =====================================================

  mapOrderStatus(wpStatus: string): string {
    const statusMap: Record<string, string> = {
      "wc-completed": "COMPLETED",
      "wc-processing": "CONFIRMED",
      "wc-on-hold": "PENDING",
      "wc-pending": "PENDING",
      "wc-cancelled": "CANCELLED",
      "wc-refunded": "CANCELLED",
      "wc-failed": "REJECTED",
    };
    return statusMap[wpStatus] || "PENDING";
  }

  mapPaymentMethod(wpMethod: string): string {
    const methodMap: Record<string, string> = {
      stripe: "STRIPE",
      bacs: "BACS",
      cheque: "CHEQUE",
      cod: "THOKMANDEE_PAY",
      paypal: "CARD",
    };
    return methodMap[wpMethod] || "CARD";
  }

  async userExists(userId: number): Promise<boolean> {
    const result = await this.pgClient.query(
      'SELECT id FROM "User" WHERE id = $1 LIMIT 1',
      [userId]
    );
    return result.rows.length > 0;
  }

  async productExists(productId: number): Promise<number | null> {
    const result = await this.pgClient.query(
      'SELECT id, "vendorId" FROM "Product" WHERE id = $1 LIMIT 1',
      [productId]
    );
    return result.rows.length > 0 ? result.rows[0].vendorId : null;
  }

  async mainOrderExists(mainOrderNumber: string): Promise<boolean> {
    const result = await this.pgClient.query(
      'SELECT id FROM "MainOrder" WHERE "mainOrderNumber" = $1 LIMIT 1',
      [mainOrderNumber]
    );
    return result.rows.length > 0;
  }

  async orderExists(orderId: number): Promise<boolean> {
    const result = await this.pgClient.query(
      'SELECT id FROM "Order" WHERE id = $1 LIMIT 1',
      [orderId]
    );
    return result.rows.length > 0;
  }

  // =====================================================
  // PHASE 3: Migrate MainOrders
  // =====================================================

  async createMainOrder(
    wpOrder: any,
    meta: Record<string, string>
  ): Promise<number | null> {
    const mainOrderNumber = wpOrder.order_key || `WC-${wpOrder.order_id}`;

    // Check if already exists
    if (await this.mainOrderExists(mainOrderNumber)) {
      return null; // Skip
    }

    const customerId = parseInt(meta._customer_user || "0");
    if (customerId === 0 || !(await this.userExists(customerId))) {
      return null; // No valid customer
    }

    const orderTotal = parseFloat(meta._order_total || "0");
    const paymentMethod = this.mapPaymentMethod(meta._payment_method || "card");
    const status = this.mapOrderStatus(wpOrder.post_status);

    const result = await this.pgClient.query(
      `
      INSERT INTO "MainOrder" (
        "mainOrderNumber", total, "userId", status, notes, "paymentMethod",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4::"OrderStatus", $5, $6::"PaymentMethod", $7, $8)
      RETURNING id
    `,
      [
        mainOrderNumber,
        orderTotal,
        customerId,
        status,
        wpOrder.customer_note || null,
        paymentMethod,
        new Date(wpOrder.post_date),
        new Date(wpOrder.post_modified),
      ]
    );

    this.stats.mainOrdersCreated++;
    return result.rows[0].id;
  }

  // =====================================================
  // PHASE 4: Migrate Orders (Vendor Sub-orders)
  // =====================================================

  async createOrder(
    wpOrderId: number,
    mainOrderId: number,
    customerId: number,
    vendorId: number,
    total: number,
    status: string,
    wpOrder: any,
    meta: Record<string, string>,
    delivery: any
  ): Promise<boolean> {
    // Check if order already exists
    if (await this.orderExists(wpOrderId)) {
      return false;
    }

    // Check if vendor exists
    if (!(await this.userExists(vendorId))) {
      console.log(`  ⚠️  Vendor ${vendorId} not found`);
      return false;
    }

    const orderNumber = `VO-${wpOrderId}-${vendorId}`;

    await this.pgClient.query(
      `
      INSERT INTO "Order" (
        id, "orderNumber", total, status, notes, "mainOrderId",
        "userId", "vendorId", "createdAt", "updatedAt",
        "wordpressOrderKey", "shippingTotal", "taxTotal", "cartDiscount",
        "deliveryDate", "deliveryTimeSlot", "deliveryType"
      ) VALUES (
        $1, $2, $3, $4::"OrderStatus", $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17
      )
      ON CONFLICT (id) DO NOTHING
    `,
      [
        wpOrderId,
        orderNumber,
        total,
        status,
        wpOrder.customer_note || null,
        mainOrderId,
        customerId,
        vendorId,
        new Date(wpOrder.post_date),
        new Date(wpOrder.post_modified),
        wpOrder.order_key || null,
        parseFloat(meta._order_shipping || "0"),
        parseFloat(meta._order_tax || "0"),
        parseFloat(meta._cart_discount || "0"),
        delivery?.delivery_date || null,
        delivery?.delivery_time_slot || null,
        delivery?.delivery_type || null,
      ]
    );

    this.stats.ordersCreated++;
    return true;
  }

  // =====================================================
  // PHASE 5: Migrate Addresses
  // =====================================================

  async createOrderAddress(
    orderId: number,
    customerId: number,
    meta: Record<string, string>
  ): Promise<boolean> {
    if (!meta._shipping_first_name && !meta._shipping_address_1) {
      return false;
    }

    // Check if address already exists for this order
    const existsCheck = await this.pgClient.query(
      'SELECT id FROM "orderAddress" WHERE "orderId" = $1 LIMIT 1',
      [orderId]
    );
    if (existsCheck.rows.length > 0) {
      return false;
    }

    const fullName =
      `${meta._shipping_first_name || ""} ${
        meta._shipping_last_name || ""
      }`.trim() || null;

    await this.pgClient.query(
      `
      INSERT INTO "orderAddress" (
        "userId", "orderId", "fullName", email, phone,
        country, address, "zipCode", city,
        company, "address2", state, "vatNumber"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT ("orderId") DO NOTHING
    `,
      [
        customerId,
        orderId,
        fullName,
        meta._billing_email || null,
        meta._shipping_phone || meta._billing_phone || null,
        meta._shipping_country || null,
        meta._shipping_address_1 || null,
        meta._shipping_postcode || null,
        meta._shipping_city || null,
        meta._shipping_company || null,
        meta._shipping_address_2 || null,
        meta._shipping_state || null,
        meta._shipping_vat_number || meta._billing_vat_number || null,
      ]
    );

    this.stats.addressesCreated++;
    return true;
  }

  // =====================================================
  // PHASE 6: Migrate Order Items
  // =====================================================

  async createOrderItems(orderId: number, vendorId: number): Promise<number> {
    const items = this.orderItems.get(orderId) || [];
    let created = 0;

    if (items.length === 0) {
      // Debug: no items found for this order
      return 0;
    }

    for (const item of items) {
      const meta = this.itemMeta.get(item.order_item_id) || {};
      const productId = parseInt(meta._product_id || "0");
      const variationId = parseInt(meta._variation_id || "0");
      const quantity = parseInt(meta._qty || "1");
      const lineTotal = parseFloat(meta._line_total || "0");
      const price = quantity > 0 ? lineTotal / quantity : 0;

      // Check if product exists (but don't filter by vendor - items should be added)
      let productExists = false;
      if (productId > 0) {
        const result = await this.pgClient.query(
          'SELECT id FROM "Product" WHERE id = $1 LIMIT 1',
          [productId]
        );
        productExists = result.rows.length > 0;
      }

      try {
        await this.pgClient.query(
          `
          INSERT INTO "OrderItem" (
            "wordpressItemId", "orderId", "productId", "productName",
            quantity, price, subtotal, "variationId", sku
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT DO NOTHING
        `,
          [
            item.order_item_id,
            orderId,
            productExists ? productId : null,
            item.order_item_name || "Product",
            quantity,
            price,
            lineTotal,
            variationId > 0 ? variationId : null,
            meta._sku || null,
          ]
        );
        created++;
        this.stats.orderItemsCreated++;
      } catch (e: any) {
        // Log error for debugging
        console.log(`    ⚠️  Item error: ${e.message}`);
      }
    }

    return created;
  }

  // =====================================================
  // PHASE 7: Migrate Payments
  // =====================================================

  async createPayment(
    mainOrderId: number,
    customerId: number,
    meta: Record<string, string>,
    wpOrder: any
  ): Promise<boolean> {
    if (!meta._payment_method) {
      return false;
    }

    const stripePaymentIntent =
      meta._stripe_intent_id ||
      meta._transaction_id ||
      `WP-${wpOrder.order_id}-${Date.now()}`;

    // Check if payment already exists
    const existsCheck = await this.pgClient.query(
      'SELECT id FROM "Payment" WHERE "stripePaymentIntent" = $1 LIMIT 1',
      [stripePaymentIntent]
    );
    if (existsCheck.rows.length > 0) {
      return false;
    }

    const orderTotal = parseFloat(meta._order_total || "0");
    const paymentStatus = meta._date_paid ? "COMPLETED" : "PENDING";

    const metadata = JSON.stringify({
      payment_method_title: meta._payment_method_title,
      billing_vat_number: meta._billing_vat_number,
      vat_exempt: meta.is_vat_exempt,
      invoice_number: meta._wcpdf_invoice_number,
    });

    await this.pgClient.query(
      `
      INSERT INTO "Payment" (
        "orderId", "userId", "stripePaymentIntent",
        amount, currency, status, "paymentMethod", metadata,
        "transactionId", "stripeFee", "stripeNet", "stripeCustomerId",
        "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6::"PaymentStatus", $7, $8::jsonb,
        $9, $10, $11, $12, $13, $14
      )
      ON CONFLICT ("stripePaymentIntent") DO NOTHING
    `,
      [
        mainOrderId,
        customerId,
        stripePaymentIntent,
        orderTotal,
        (meta._order_currency || "EUR").toLowerCase(),
        paymentStatus,
        meta._payment_method || null,
        metadata,
        meta._transaction_id || null,
        parseFloat(meta._stripe_fee || "0"),
        parseFloat(meta._stripe_net || "0"),
        meta._stripe_customer_id || null,
        meta._date_paid
          ? new Date(parseInt(meta._date_paid) * 1000)
          : new Date(wpOrder.post_date),
        new Date(wpOrder.post_modified),
      ]
    );

    this.stats.paymentsCreated++;
    return true;
  }

  // =====================================================
  // PHASE 8: Update Sequences
  // =====================================================

  async updateSequences() {
    console.log("\n🔄 Updating sequences...");

    try {
      // MainOrder sequence
      const mainOrderMax = await this.pgClient.query(
        'SELECT MAX(id) as max_id FROM "MainOrder"'
      );
      if (mainOrderMax.rows[0].max_id) {
        await this.pgClient.query(
          `SELECT setval('"MainOrder_id_seq"', $1, true)`,
          [mainOrderMax.rows[0].max_id]
        );
        console.log(`  MainOrder sequence: ${mainOrderMax.rows[0].max_id + 1}`);
      }

      // Order sequence
      const orderMax = await this.pgClient.query(
        'SELECT MAX(id) as max_id FROM "Order"'
      );
      if (orderMax.rows[0].max_id) {
        await this.pgClient.query(`SELECT setval('"Order_id_seq"', $1, true)`, [
          orderMax.rows[0].max_id,
        ]);
        console.log(`  Order sequence: ${orderMax.rows[0].max_id + 1}`);
      }

      // OrderItem sequence
      const itemMax = await this.pgClient.query(
        'SELECT MAX(id) as max_id FROM "OrderItem"'
      );
      if (itemMax.rows[0].max_id) {
        await this.pgClient.query(
          `SELECT setval('"OrderItem_id_seq"', $1, true)`,
          [itemMax.rows[0].max_id]
        );
        console.log(`  OrderItem sequence: ${itemMax.rows[0].max_id + 1}`);
      }

      // Payment sequence
      const paymentMax = await this.pgClient.query(
        'SELECT MAX(id) as max_id FROM "Payment"'
      );
      if (paymentMax.rows[0].max_id) {
        await this.pgClient.query(
          `SELECT setval('"Payment_id_seq"', $1, true)`,
          [paymentMax.rows[0].max_id]
        );
        console.log(`  Payment sequence: ${paymentMax.rows[0].max_id + 1}`);
      }

      // orderAddress sequence
      const addressMax = await this.pgClient.query(
        'SELECT MAX(id) as max_id FROM "orderAddress"'
      );
      if (addressMax.rows[0].max_id) {
        await this.pgClient.query(
          `SELECT setval('"orderAddress_id_seq"', $1, true)`,
          [addressMax.rows[0].max_id]
        );
        console.log(
          `  orderAddress sequence: ${addressMax.rows[0].max_id + 1}`
        );
      }
    } catch (e: any) {
      console.log(`  ⚠️  Could not update some sequences: ${e.message}`);
    }
  }

  // =====================================================
  // MAIN MIGRATION
  // =====================================================

  async run() {
    try {
      await this.connect();

      // Phase 0: Create tables and enums
      await this.createTablesAndEnums();

      // Phase 1: Create extra columns
      await this.createExtraColumns();

      // Phase 2: Fetch all WordPress data
      const orders = await this.fetchWordPressData();

      // Separate parent and child orders
      const parentOrders = orders.filter(
        (o: any) => o.post_parent === 0 || o.post_parent === null
      );
      const childOrders = orders.filter((o: any) => o.post_parent > 0);

      console.log(`📦 Parent orders: ${parentOrders.length}`);
      console.log(
        `📦 Child orders (will be handled via Dokan): ${childOrders.length}\n`
      );

      console.log("🚀 Phase 3-7: Migrating orders...\n");

      // Process each parent order
      for (const wpOrder of parentOrders) {
        try {
          const orderId = wpOrder.order_id;
          const meta = this.orderMeta.get(orderId) || {};
          const dokanVendors = this.dokanOrders.get(orderId) || [];
          const deliveries = this.deliveryTimes.get(orderId) || [];

          const customerId = parseInt(meta._customer_user || "0");
          if (customerId === 0) {
            this.stats.skipped++;
            continue;
          }

          // Check if customer exists
          if (!(await this.userExists(customerId))) {
            console.log(
              `⚠️  Skipping order ${orderId} - user ${customerId} not found`
            );
            this.stats.skipped++;
            continue;
          }

          // Create MainOrder
          const mainOrderId = await this.createMainOrder(wpOrder, meta);
          if (!mainOrderId) {
            this.stats.skipped++;
            continue;
          }
          console.log(`✅ MainOrder ${mainOrderId} for WP Order ${orderId}`);

          // Create vendor Orders (from Dokan)
          if (dokanVendors.length > 0) {
            for (const dokan of dokanVendors) {
              const delivery = deliveries.find(
                (d: any) => d.seller_id === dokan.seller_id
              );

              const created = await this.createOrder(
                orderId,
                mainOrderId,
                customerId,
                dokan.seller_id,
                dokan.order_total,
                this.mapOrderStatus(dokan.order_status),
                wpOrder,
                meta,
                delivery
              );

              if (created) {
                console.log(
                  `  ✅ Order ${orderId} for vendor ${dokan.seller_id}`
                );

                // Create address
                await this.createOrderAddress(orderId, customerId, meta);

                // Create order items
                const itemCount = await this.createOrderItems(
                  orderId,
                  dokan.seller_id
                );
                if (itemCount > 0) {
                  console.log(`    📦 ${itemCount} order items`);
                }
              }
            }
          } else {
            // Single vendor order
            const vendorId = parseInt(
              meta._dokan_vendor_id || wpOrder.post_author || "0"
            );

            if (vendorId > 0) {
              const orderTotal = parseFloat(meta._order_total || "0");
              const delivery = deliveries[0];

              const created = await this.createOrder(
                orderId,
                mainOrderId,
                customerId,
                vendorId,
                orderTotal,
                this.mapOrderStatus(wpOrder.post_status),
                wpOrder,
                meta,
                delivery
              );

              if (created) {
                console.log(`  ✅ Single vendor Order ${orderId}`);

                // Create address
                await this.createOrderAddress(orderId, customerId, meta);

                // Create order items
                const itemCount = await this.createOrderItems(
                  orderId,
                  vendorId
                );
                if (itemCount > 0) {
                  console.log(`    📦 ${itemCount} order items`);
                }
              }
            }
          }

          // Create Payment
          await this.createPayment(mainOrderId, customerId, meta, wpOrder);

          console.log("");
        } catch (error: any) {
          this.stats.errors++;
          console.error(
            `❌ Error migrating order ${wpOrder.order_id}:`,
            error.message
          );
        }
      }

      // Update sequences
      await this.updateSequences();

      // Print summary
      this.printSummary();
    } catch (error) {
      console.error("💥 Migration failed:", error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  printSummary() {
    console.log("\n" + "=".repeat(60));
    console.log("📊 ORDER MIGRATION SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total WP orders:       ${this.stats.totalOrders}`);
    console.log(`✅ MainOrders created: ${this.stats.mainOrdersCreated}`);
    console.log(`✅ Orders created:     ${this.stats.ordersCreated}`);
    console.log(`✅ Addresses created:  ${this.stats.addressesCreated}`);
    console.log(`✅ Order items created:${this.stats.orderItemsCreated}`);
    console.log(`✅ Payments created:   ${this.stats.paymentsCreated}`);
    console.log(`⏭️  Skipped:            ${this.stats.skipped}`);
    console.log(`❌ Errors:             ${this.stats.errors}`);
    console.log("=".repeat(60));
  }
}

// Run migration
if (require.main === module) {
  const migration = new OrderMigration();

  migration
    .run()
    .then(() => {
      console.log("\n🎉 Order migration completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Migration failed:", error);
      process.exit(1);
    });
}

export default OrderMigration;
