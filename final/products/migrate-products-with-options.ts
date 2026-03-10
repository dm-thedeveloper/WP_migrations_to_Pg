/**
 * WordPress Products to PostgreSQL Migration
 * WITH ProductOptions (One-to-Many relationship)
 *
 * Creates ProductOptions table with productId foreign key
 * Each product can have MULTIPLE ProductOptions (color, size, etc.)
 *
 * Preserves WordPress post IDs as Product IDs
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

// PostgreSQL configuration
const pgConfig = {
  host: "13.60.17.42",
  port: 5432,
  user: "adminuser",
  password: "Vgvguy766%^&FuuvD",
  database: "wordpress_migration_db",
};

// Attribute name normalization map
const ATTRIBUTE_NORMALIZATION: { [key: string]: string } = {
  color: "color",
  colour: "color",
  colors: "color",
  colours: "color",
  cor: "color",
  size: "size",
  sizes: "size",
  talla: "size",
  tamanho: "size",
  tamaño: "size",
  siza: "size",
  quantity: "quantity",
  flavour: "flavor",
  flavours: "flavor",
  flavor: "flavor",
  flavors: "flavor",
  pattern: "pattern",
  patterns: "pattern",
  paterns: "pattern",
  design: "design",
  designs: "design",
  feature: "feature",
  features: "feature",
  shape: "shape",
  shapes: "shape",
  variation: "variation",
  variations: "variation",
  material: "material",
  materials: "material",
  style: "style",
  styles: "style",
};

interface MigrationStats {
  totalProducts: number;
  productsSuccess: number;
  productsSkipped: number;
  productsError: number;
  categoriesLinked: number;
  optionsCreated: number;
  optionsLinked: number;
}

class ProductWithOptionsMigration {
  private wpConnection!: mysql.Connection;
  private pgClient!: Client;
  private stats: MigrationStats = {
    totalProducts: 0,
    productsSuccess: 0,
    productsSkipped: 0,
    productsError: 0,
    categoriesLinked: 0,
    optionsCreated: 0,
    optionsLinked: 0,
  };

  async connect() {
    console.log("🔌 Connecting to WordPress MySQL...");
    this.wpConnection = await mysql.createConnection(wpConfig);
    console.log("✅ WordPress connected\n");

    console.log("🔌 Connecting to PostgreSQL...");
    this.pgClient = new Client(pgConfig);
    await this.pgClient.connect();
    console.log("✅ PostgreSQL connected\n");
  }

  async disconnect() {
    if (this.wpConnection) await this.wpConnection.end();
    if (this.pgClient) await this.pgClient.end();
  }

  // =====================================================
  // PHASE 1: Ensure Tables and Columns
  // =====================================================

  async ensureTables() {
    console.log("📋 Phase 1: Ensuring all tables and columns exist...\n");

    // Ensure UnitTypes enum exists
    await this.pgClient.query(`
      DO $$ BEGIN
        CREATE TYPE "UnitTypes" AS ENUM ('KG', 'G', 'CM', 'M');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Additional Product columns
    const additionalColumns = [
      { name: "shortDescription", type: "TEXT" },
      { name: "geoAddress", type: "TEXT" },
      { name: "geoLatitude", type: "DECIMAL(10, 8)" },
      { name: "geoLongitude", type: "DECIMAL(11, 8)" },
      { name: "totalSales", type: "INTEGER DEFAULT 0" },
      { name: "postViews", type: "INTEGER DEFAULT 0" },
      { name: "wpStatus", type: "TEXT" },
      { name: "wholesaleMinQty", type: "INTEGER DEFAULT 0" },
    ];

    for (const col of additionalColumns) {
      try {
        await this.pgClient.query(`
          ALTER TABLE "Product" 
          ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}
        `);
      } catch (error: any) {
        if (!error.message.includes("already exists")) {
          console.log(
            `  ⚠️  Could not add column ${col.name}: ${error.message}`,
          );
        }
      }
    }

    // Create ProductOptions table with productId (ONE-TO-MANY)
    console.log(
      "  Creating ProductOptions table (one-to-many with Product)...",
    );
    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS "ProductOptions" (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        values TEXT[] NOT NULL DEFAULT '{}',
        "productId" INTEGER NOT NULL,
        CONSTRAINT fk_product FOREIGN KEY ("productId") 
          REFERENCES "Product"(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    await this.pgClient.query(`
      CREATE INDEX IF NOT EXISTS idx_productoptions_productid ON "ProductOptions"("productId")
    `);
    await this.pgClient.query(`
      CREATE INDEX IF NOT EXISTS idx_productoptions_type ON "ProductOptions"(type)
    `);

    // Remove old productOptionsId column from Product if exists (old schema)
    try {
      await this.pgClient.query(`
        ALTER TABLE "Product" DROP COLUMN IF EXISTS "productOptionsId"
      `);
    } catch (e) {
      // Ignore
    }

    console.log("✅ Tables and columns verified\n");
  }

  // =====================================================
  // PHASE 2: Fetch WordPress Products
  // =====================================================

  async fetchWordPressProducts(limit: number = 100, offset: number = 0) {
    const query = `
      SELECT 
          p.ID as product_id,
          p.post_title as title,
          p.post_content as description,
          p.post_excerpt as short_description,
          p.post_author as vendor_id,
          p.post_date as created_at,
          p.post_modified as updated_at,
          p.post_status as wp_status,
          
          CASE 
              WHEN p.post_status = 'publish' THEN 'PUBLISHED'
              WHEN p.post_status = 'draft' THEN 'DRAFT'
              ELSE 'UNPUBLISHED'
          END as product_status,
          
          p.comment_status,
          
          MAX(CASE WHEN pm.meta_key = '_sku' THEN pm.meta_value END) as sku,
          MAX(CASE WHEN pm.meta_key = '_price' THEN pm.meta_value END) as mrsp,
          MAX(CASE WHEN pm.meta_key = '_regular_price' THEN pm.meta_value END) as regular_price,
          MAX(CASE WHEN pm.meta_key = '_sale_price' THEN pm.meta_value END) as discounted_price,
          MAX(CASE WHEN pm.meta_key = '_sale_price_dates_from' THEN pm.meta_value END) as sale_from,
          MAX(CASE WHEN pm.meta_key = '_sale_price_dates_to' THEN pm.meta_value END) as sale_to,
          MAX(CASE WHEN pm.meta_key = '_dokan_wholesale_meta' THEN pm.meta_value END) as wholesale_meta,
          MAX(CASE WHEN pm.meta_key = '_stock_status' THEN pm.meta_value END) as stock_status,
          MAX(CASE WHEN pm.meta_key = '_stock' THEN pm.meta_value END) as stock_quantity,
          MAX(CASE WHEN pm.meta_key = '_thumbnail_id' THEN pm.meta_value END) as featured_image_id,
          MAX(CASE WHEN pm.meta_key = '_product_image_gallery' THEN pm.meta_value END) as gallery_image_ids,
          MAX(CASE WHEN pm.meta_key = '_weight' THEN pm.meta_value END) as weight,
          MAX(CASE WHEN pm.meta_key = 'min_quantity' THEN pm.meta_value END) as minimum_order_quantity,
          MAX(CASE WHEN pm.meta_key = '_wc_average_rating' THEN pm.meta_value END) as average_rating,
          MAX(CASE WHEN pm.meta_key = 'gtin' THEN pm.meta_value END) as gtin,
          MAX(CASE WHEN pm.meta_key = '_country_of_origin' THEN pm.meta_value END) as country,
          MAX(CASE WHEN pm.meta_key = '_vat_rate' THEN pm.meta_value END) as vat_rate,
          MAX(CASE WHEN pm.meta_key = '_tariff_code' THEN pm.meta_value END) as tariff_code,
          MAX(CASE WHEN pm.meta_key = '_tax_class' THEN pm.meta_value END) as tax_class,
          MAX(CASE WHEN pm.meta_key = 'dokan_geo_address' THEN pm.meta_value END) as geo_address,
          MAX(CASE WHEN pm.meta_key = 'dokan_geo_latitude' THEN pm.meta_value END) as geo_latitude,
          MAX(CASE WHEN pm.meta_key = 'dokan_geo_longitude' THEN pm.meta_value END) as geo_longitude,
          MAX(CASE WHEN pm.meta_key = 'post_views_count' THEN pm.meta_value END) as post_views_count,
          MAX(CASE WHEN pm.meta_key = 'total_sales' THEN pm.meta_value END) as total_sales_meta

      FROM wp_posts p
      LEFT JOIN wp_postmeta pm ON p.ID = pm.post_id

      WHERE p.post_type = 'product'
        AND p.post_status IN ('publish', 'draft', 'pending', 'private')

      GROUP BY p.ID, p.post_title, p.post_content, p.post_excerpt, 
               p.post_author, p.post_date, p.post_modified, p.post_status, p.comment_status

      ORDER BY p.ID
      LIMIT ? OFFSET ?
    `;

    const [products] = await this.wpConnection.query<mysql.RowDataPacket[]>(
      query,
      [limit, offset],
    );
    return products;
  }

  async getTotalProductCount(): Promise<number> {
    const [result] = await this.wpConnection.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) as total FROM wp_posts WHERE post_type = 'product' AND post_status IN ('publish', 'draft', 'pending', 'private')",
    );
    return result[0].total;
  }

  // =====================================================
  // PHASE 3: Fetch Product Attributes from WordPress
  // =====================================================

  normalizeAttributeName(name: string): string {
    const normalized = name.toLowerCase().trim().replace(/\s+/g, "_");
    return ATTRIBUTE_NORMALIZATION[normalized] || normalized;
  }

  async fetchProductAttributes(
    productId: number,
  ): Promise<Map<string, string[]>> {
    const attributesMap = new Map<string, string[]>();

    // 1. Fetch taxonomy attributes (pa_color, pa_size, etc.)
    const [taxonomyAttrs] = await this.wpConnection.query<
      mysql.RowDataPacket[]
    >(
      `
      SELECT 
        REPLACE(tt.taxonomy, 'pa_', '') as attribute_type,
        t.name as attribute_value
      FROM wp_term_relationships tr
      JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
      JOIN wp_terms t ON tt.term_id = t.term_id
      WHERE tr.object_id = ?
        AND tt.taxonomy LIKE 'pa_%'
    `,
      [productId],
    );

    for (const row of taxonomyAttrs) {
      const type = this.normalizeAttributeName(row.attribute_type);
      const value = row.attribute_value.trim();

      if (!attributesMap.has(type)) {
        attributesMap.set(type, []);
      }
      if (!attributesMap.get(type)!.includes(value)) {
        attributesMap.get(type)!.push(value);
      }
    }

    // 2. Fetch variation attributes from child variations
    const [variationAttrs] = await this.wpConnection.query<
      mysql.RowDataPacket[]
    >(
      `
      SELECT 
        REPLACE(tt.taxonomy, 'pa_', '') as attribute_type,
        t.name as attribute_value
      FROM wp_posts p
      JOIN wp_term_relationships tr ON p.ID = tr.object_id
      JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
      JOIN wp_terms t ON tt.term_id = t.term_id
      WHERE p.post_parent = ?
        AND p.post_type = 'product_variation'
        AND tt.taxonomy LIKE 'pa_%'
    `,
      [productId],
    );

    for (const row of variationAttrs) {
      const type = this.normalizeAttributeName(row.attribute_type);
      const value = row.attribute_value.trim();

      if (!attributesMap.has(type)) {
        attributesMap.set(type, []);
      }
      if (!attributesMap.get(type)!.includes(value)) {
        attributesMap.get(type)!.push(value);
      }
    }

    // 3. Parse _product_attributes meta for custom attributes
    const [metaAttrs] = await this.wpConnection.query<mysql.RowDataPacket[]>(
      `
      SELECT meta_value 
      FROM wp_postmeta 
      WHERE post_id = ? AND meta_key = '_product_attributes'
    `,
      [productId],
    );

    if (metaAttrs.length > 0 && metaAttrs[0].meta_value) {
      const parsed = this.parsePhpSerializedAttributes(metaAttrs[0].meta_value);
      for (const attr of parsed) {
        const type = this.normalizeAttributeName(attr.name.replace("pa_", ""));

        if (!attributesMap.has(type)) {
          attributesMap.set(type, []);
        }
        for (const value of attr.values) {
          if (!attributesMap.get(type)!.includes(value)) {
            attributesMap.get(type)!.push(value);
          }
        }
      }
    }

    return attributesMap;
  }

  parsePhpSerializedAttributes(
    serialized: string,
  ): Array<{ name: string; values: string[] }> {
    const results: Array<{ name: string; values: string[] }> = [];
    if (!serialized || serialized === "a:0:{}") return results;

    try {
      // Extract attribute names and values
      const attrPattern =
        /s:\d+:"(pa_[^"]+|[^"]+)";a:\d+:\{([^}]+(?:\{[^}]*\})*[^}]*)\}/g;
      let match;

      while ((match = attrPattern.exec(serialized)) !== null) {
        const attrName = match[1];
        const attrContent = match[2];

        // Check for direct values (non-taxonomy)
        const valueMatch = attrContent.match(/s:5:"value";s:\d+:"([^"]+)"/);
        if (valueMatch && valueMatch[1]) {
          const values = valueMatch[1]
            .split("|")
            .map((v) => v.trim())
            .filter((v) => v);
          if (values.length > 0) {
            results.push({ name: attrName, values });
          }
        }
      }
    } catch (e) {
      // Skip unparseable
    }

    return results;
  }

  // =====================================================
  // PHASE 4: Create ProductOptions for a Product
  // =====================================================

  async createProductOptions(
    productId: number,
    attributesMap: Map<string, string[]>,
  ): Promise<number> {
    let optionsCreated = 0;

    for (const [type, values] of attributesMap) {
      if (values.length === 0) continue;

      try {
        // Create a ProductOptions record for this product and type
        // Each ProductOptions has: type, values[], productId
        await this.pgClient.query(
          `
          INSERT INTO "ProductOptions" (type, values, "productId")
          VALUES ($1, $2, $3)
        `,
          [type, values, productId],
        );

        optionsCreated++;
      } catch (error: any) {
        console.log(`    ⚠️  Error creating option ${type}: ${error.message}`);
      }
    }

    // Update hasOptions on Product if any options were created
    if (optionsCreated > 0) {
      await this.pgClient.query(
        `
        UPDATE "Product" SET "hasOptions" = true WHERE id = $1
      `,
        [productId],
      );
    }

    return optionsCreated;
  }

  // =====================================================
  // Helper Functions
  // =====================================================

  async getProductCategories(productId: number): Promise<string> {
    const [categories] = await this.wpConnection.query<mysql.RowDataPacket[]>(
      `SELECT t.term_id 
       FROM wp_term_relationships tr
       JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
       JOIN wp_terms t ON tt.term_id = t.term_id
       WHERE tr.object_id = ? AND tt.taxonomy = 'product_cat'`,
      [productId],
    );
    return categories.map((c: any) => c.term_id).join(",");
  }

  async getProductTags(productId: number): Promise<string[]> {
    const [tags] = await this.wpConnection.query<mysql.RowDataPacket[]>(
      `SELECT t.name 
       FROM wp_term_relationships tr
       JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
       JOIN wp_terms t ON tt.term_id = t.term_id
       WHERE tr.object_id = ? AND tt.taxonomy = 'product_tag'`,
      [productId],
    );
    return tags.map((t: any) => t.name);
  }

  async getImageUrls(
    featuredId: string | null,
    galleryIds: string | null,
  ): Promise<string[]> {
    const images: string[] = [];

    try {
      if (featuredId) {
        const [result] = await this.wpConnection.query<mysql.RowDataPacket[]>(
          "SELECT guid FROM wp_posts WHERE ID = ? AND post_type = 'attachment'",
          [featuredId],
        );
        if (result.length > 0) images.push(result[0].guid);
      }

      if (galleryIds) {
        const ids = galleryIds.split(",").map((id) => id.trim());
        for (const id of ids) {
          const [result] = await this.wpConnection.query<mysql.RowDataPacket[]>(
            "SELECT guid FROM wp_posts WHERE ID = ? AND post_type = 'attachment'",
            [id],
          );
          if (result.length > 0) images.push(result[0].guid);
        }
      }
    } catch (error) {
      // Ignore image fetch errors
    }

    return images;
  }

  parseWholesaleMeta(serialized: string | null): {
    wholesaleEnabled: boolean;
    wholesalePrice: number;
    wholesaleQuantity: number;
  } {
    if (!serialized)
      return {
        wholesaleEnabled: false,
        wholesalePrice: 0,
        wholesaleQuantity: 0,
      };

    try {
      let wholesaleEnabled = false;
      let wholesalePrice = 0;
      let wholesaleQuantity = 0;

      const enableMatch = serialized.match(
        /s:17:"enable_wholesale";s:\d+:"([^"]+)"/,
      );
      if (enableMatch && enableMatch[1]) {
        wholesaleEnabled = enableMatch[1].toLowerCase() === "yes";
      }

      const priceMatch = serialized.match(/s:5:"price";s:\d+:"([^"]+)"/);
      if (priceMatch && priceMatch[1]) {
        const price = parseFloat(priceMatch[1]);
        wholesalePrice = isNaN(price) ? 0 : price;
      }

      const quantityMatch = serialized.match(/s:8:"quantity";s:\d+:"([^"]+)"/);
      if (quantityMatch && quantityMatch[1]) {
        const qty = parseInt(quantityMatch[1]);
        wholesaleQuantity = isNaN(qty) ? 0 : qty;
      }

      return { wholesaleEnabled, wholesalePrice, wholesaleQuantity };
    } catch (error) {
      return {
        wholesaleEnabled: false,
        wholesalePrice: 0,
        wholesaleQuantity: 0,
      };
    }
  }

  async createShippingMeasurements(weight: number): Promise<number | null> {
    if (!weight || weight <= 0) return null;

    try {
      await this.pgClient.query(`
        CREATE TABLE IF NOT EXISTS "ShippingMeasurements" (
          id SERIAL PRIMARY KEY,
          "itemWeight" INTEGER NOT NULL DEFAULT 0,
          "itemWeightUnit" "UnitTypes" NOT NULL DEFAULT 'KG',
          "itemLength" INTEGER NOT NULL DEFAULT 0,
          "itemLengthUnit" "UnitTypes" NOT NULL DEFAULT 'CM',
          "itemWidth" INTEGER NOT NULL DEFAULT 0,
          "itemWidthUnit" "UnitTypes" NOT NULL DEFAULT 'CM',
          "itemHeight" INTEGER NOT NULL DEFAULT 0,
          "itemHeightUnit" "UnitTypes" NOT NULL DEFAULT 'CM',
          "packageWeight" INTEGER NOT NULL DEFAULT 0,
          "packageWeightUnit" "UnitTypes" NOT NULL DEFAULT 'KG',
          "packageLength" INTEGER NOT NULL DEFAULT 0,
          "packageLengthUnit" "UnitTypes" NOT NULL DEFAULT 'CM',
          "packageWidth" INTEGER NOT NULL DEFAULT 0,
          "packageWidthUnit" "UnitTypes" NOT NULL DEFAULT 'CM',
          "packageHeight" INTEGER NOT NULL DEFAULT 0,
          "packageHeightUnit" "UnitTypes" NOT NULL DEFAULT 'CM'
        )
      `);

      const weightInt = Math.round(weight);
      const result = await this.pgClient.query(
        `
        INSERT INTO "ShippingMeasurements" (
          "itemWeight", "itemWeightUnit",
          "itemLength", "itemLengthUnit",
          "itemWidth", "itemWidthUnit",
          "itemHeight", "itemHeightUnit",
          "packageWeight", "packageWeightUnit",
          "packageLength", "packageLengthUnit",
          "packageWidth", "packageWidthUnit",
          "packageHeight", "packageHeightUnit"
        ) VALUES (
          $1, 'KG', 0, 'CM', 0, 'CM', 0, 'CM',
          $1, 'KG', 0, 'CM', 0, 'CM', 0, 'CM'
        ) RETURNING id
      `,
        [weightInt],
      );

      return result.rows[0].id;
    } catch (error: any) {
      return null;
    }
  }

  async productExists(productId: number): Promise<boolean> {
    const result = await this.pgClient.query(
      'SELECT id FROM "Product" WHERE id = $1 LIMIT 1',
      [productId],
    );
    return result.rows.length > 0;
  }

  async vendorExists(vendorId: number): Promise<boolean> {
    const result = await this.pgClient.query(
      'SELECT id FROM "User" WHERE id = $1 LIMIT 1',
      [vendorId],
    );
    return result.rows.length > 0;
  }

  // =====================================================
  // PHASE 5: Insert Product with all data
  // =====================================================

  async insertProduct(product: any) {
    const images = await this.getImageUrls(
      product.featured_image_id,
      product.gallery_image_ids,
    );
    const { wholesaleEnabled, wholesalePrice, wholesaleQuantity } =
      this.parseWholesaleMeta(product.wholesale_meta);
    const tags = Array.isArray(product.tags) ? product.tags : [];
    const vatRate =
      product.vat_rate === "reduced-rate" ||
      product.tax_class === "reduced-rate"
        ? "REDUCED"
        : "STANDARD";
    const inStock = product.stock_status === "instock";
    const enableReviews = product.comment_status === "open";
    const rating = product.average_rating
      ? parseFloat(product.average_rating)
      : 0;
    const stockQty = parseInt(product.stock_quantity || "0");
    const totalSales = parseInt(product.total_sales_meta || "0");
    const postViews = parseInt(product.post_views_count || "0");
    const weight = parseFloat(product.weight || "0");

    let shippingMeasurementsId: number | null = null;
    if (weight > 0) {
      shippingMeasurementsId = await this.createShippingMeasurements(weight);
    }

    const query = `
      INSERT INTO "Product" (
        id, title, description, mrsp, wholesale, "agreePrice", "discountedPrice",
        "from", "to", images, videos, sku, gtin, country, "vatRate", "tariffCode",
        "inStock", "onHand", committed, available, "hasOptions", "sellingMethod",
        "minimumOrderQuantity", "sameMeasurement", tags, "enableReviews",
        "letRetailersBuy", "letRetailersCustomize", "requiredCustomInfo",
        "productStatus", "vendorId", rattings, "createdAt", "updatedAt",
        "shortDescription", "geoAddress", "geoLatitude", "geoLongitude",
        "totalSales", "postViews", "wpStatus", "wholesaleMinQty", "shippingMeasurementsId"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, 
        $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43
      )
    `;

    const values = [
      product.product_id,
      product.title || "Untitled Product",
      product.description || "",
      parseFloat(product.mrsp || product.regular_price || "0"),
      wholesalePrice,
      false,
      parseFloat(product.discounted_price || "0"),
      product.sale_from ? new Date(parseInt(product.sale_from) * 1000) : null,
      product.sale_to ? new Date(parseInt(product.sale_to) * 1000) : null,
      images,
      [],
      product.sku || product.wc_sku || `PROD-${product.product_id}`,
      product.gtin || "",
      product.country || "",
      vatRate,
      product.tariff_code || "",
      inStock,
      stockQty,
      0,
      stockQty,
      false, // hasOptions - will be updated later if options exist
      "BY_ITEM",
      parseInt(product.minimum_order_quantity || "1"),
      false,
      tags,
      enableReviews,
      false,
      false,
      false,
      product.product_status,
      product.vendor_id,
      rating,
      new Date(product.created_at),
      new Date(product.updated_at),
      product.short_description || "",
      product.geo_address || null,
      product.geo_latitude ? parseFloat(product.geo_latitude) : null,
      product.geo_longitude ? parseFloat(product.geo_longitude) : null,
      totalSales,
      postViews,
      product.wp_status || null,
      wholesaleQuantity,
      shippingMeasurementsId,
    ];

    await this.pgClient.query(query, values);
  }

  async linkProductCategories(
    productId: number,
    categoryIds: string | null,
  ): Promise<number> {
    if (!categoryIds) return 0;

    const ids = categoryIds
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id);
    let linked = 0;

    for (const categoryId of ids) {
      try {
        const catCheck = await this.pgClient.query(
          'SELECT id FROM "Category" WHERE id = $1',
          [parseInt(categoryId)],
        );

        if (catCheck.rows.length > 0) {
          await this.pgClient.query(
            `INSERT INTO "ProductCategory" ("productId", "categoryId", "createdAt", "updatedAt")
             VALUES ($1, $2, NOW(), NOW())
             ON CONFLICT DO NOTHING`,
            [productId, parseInt(categoryId)],
          );
          linked++;
        }
      } catch (error) {
        // Ignore
      }
    }

    return linked;
  }

  // =====================================================
  // PHASE 6: Migrate Single Product with Options
  // =====================================================

  async migrateProduct(product: any) {
    try {
      // Check if product already exists
      const exists = await this.productExists(product.product_id);
      if (exists) {
        this.stats.productsSkipped++;
        return;
      }

      // Check if vendor exists
      const vendorExists = await this.vendorExists(product.vendor_id);
      if (!vendorExists) {
        console.log(
          `❌ Vendor ${product.vendor_id} not found for: ${product.title}`,
        );
        this.stats.productsError++;
        return;
      }

      // Fetch categories, tags, and attributes
      const categoryIds = await this.getProductCategories(product.product_id);
      const tags = await this.getProductTags(product.product_id);
      const attributes = await this.fetchProductAttributes(product.product_id);

      product.category_ids = categoryIds;
      product.tags = tags;

      // Insert product first
      await this.insertProduct(product);

      // Link categories
      const categoriesLinked = await this.linkProductCategories(
        product.product_id,
        categoryIds,
      );
      this.stats.categoriesLinked += categoriesLinked;

      // Create ProductOptions (one-to-many)
      const optionsCreated = await this.createProductOptions(
        product.product_id,
        attributes,
      );
      this.stats.optionsCreated += optionsCreated;
      if (optionsCreated > 0) {
        this.stats.optionsLinked++;
      }

      // Log progress
      const optionsInfo =
        optionsCreated > 0 ? ` + ${optionsCreated} options` : "";
      const categoryInfo =
        categoriesLinked > 0 ? ` + ${categoriesLinked} cats` : "";
      console.log(
        `✅ ${product.product_id}: ${product.title.substring(
          0,
          40,
        )}${categoryInfo}${optionsInfo}`,
      );

      this.stats.productsSuccess++;
    } catch (error: any) {
      console.error(`❌ Error ${product.product_id}: ${error.message}`);
      this.stats.productsError++;
    }
  }

  // =====================================================
  // PHASE 7: Update Sequences
  // =====================================================

  async updateSequences() {
    console.log("\n🔄 Updating sequences...");

    try {
      // Product sequence
      const productMaxId = await this.pgClient.query(
        'SELECT MAX(id) as max_id FROM "Product"',
      );
      const maxProdId = productMaxId.rows[0].max_id || 0;
      await this.pgClient.query(`SELECT setval('"Product_id_seq"', $1, true)`, [
        maxProdId,
      ]);
      console.log(`  Product sequence: ${maxProdId + 1}`);

      // ProductOptions sequence
      const optionsMaxId = await this.pgClient.query(
        'SELECT MAX(id) as max_id FROM "ProductOptions"',
      );
      const maxOptId = optionsMaxId.rows[0].max_id || 0;
      if (maxOptId > 0) {
        await this.pgClient.query(
          `SELECT setval('"ProductOptions_id_seq"', $1, true)`,
          [maxOptId],
        );
        console.log(`  ProductOptions sequence: ${maxOptId + 1}`);
      }
    } catch (error: any) {
      console.log("⚠️  Could not update sequences:", error.message);
    }
  }

  // =====================================================
  // MAIN RUN
  // =====================================================

  async run() {
    const BATCH_SIZE = 100;

    try {
      await this.connect();
      await this.ensureTables();

      const totalCount = await this.getTotalProductCount();
      this.stats.totalProducts = totalCount;
      console.log(`📊 Found ${totalCount} total products\n`);

      console.log("🚀 Starting product migration with options...\n");

      let offset = 0;
      let batchNum = 1;

      while (offset < totalCount) {
        console.log(
          `\n📦 Batch ${batchNum} (${offset + 1} - ${Math.min(
            offset + BATCH_SIZE,
            totalCount,
          )})...\n`,
        );

        const products = await this.fetchWordPressProducts(BATCH_SIZE, offset);
        if (products.length === 0) break;

        for (const product of products) {
          await this.migrateProduct(product);
        }

        offset += BATCH_SIZE;
        batchNum++;
      }

      await this.updateSequences();
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
    console.log("📈 Product + Options Migration Summary");
    console.log("=".repeat(60));
    console.log(`Total products:        ${this.stats.totalProducts}`);
    console.log(`✅ Success:            ${this.stats.productsSuccess}`);
    console.log(`⏭️  Skipped:            ${this.stats.productsSkipped}`);
    console.log(`❌ Errors:             ${this.stats.productsError}`);
    console.log(`🔗 Categories linked:  ${this.stats.categoriesLinked}`);
    console.log(`🎨 Options created:    ${this.stats.optionsCreated}`);
    console.log(`📦 Products w/options: ${this.stats.optionsLinked}`);
    console.log("=".repeat(60));

    console.log("\n✅ Migration includes:");
    console.log("   - Preserved WordPress IDs");
    console.log("   - ProductOptions table (one-to-many with Product)");
    console.log("   - Each option type per product as separate row");
    console.log("   - productId foreign key on ProductOptions");
  }
}

// Run migration
if (require.main === module) {
  const migration = new ProductWithOptionsMigration();

  migration
    .run()
    .then(() => {
      console.log("\n🎉 Product + Options migration completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Migration failed:", error);
      process.exit(1);
    });
}

export default ProductWithOptionsMigration;
