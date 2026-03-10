/**
 * WordPress Products to PostgreSQL Migration
 * Preserves WordPress post IDs as Product IDs
 * Handles images, categories, tags, and all metadata
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
  // host: "13.60.17.42",
  host: "13.61.44.207",
  port: 5432,
  user: "adminuser",
  password: "Vgvguy766%^&FuuvD",
  database: "wordpress_migration_db",
};

interface MigrationStats {
  total: number;
  success: number;
  skipped: number;
  errors: number;
  categories_linked: number;
}

class ProductMigration {
  private wpConnection!: mysql.Connection;
  private pgClient!: Client;
  private stats: MigrationStats = {
    total: 0,
    success: 0,
    skipped: 0,
    errors: 0,
    categories_linked: 0,
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
    if (this.wpConnection) {
      await this.wpConnection.end();
    }
    if (this.pgClient) {
      await this.pgClient.end();
    }
  }

  async ensureProductTableColumns() {
    console.log("📋 Ensuring Product table has all required columns...");

    // Ensure UnitTypes enum exists for ShippingMeasurements
    await this.pgClient.query(`
      DO $$ BEGIN
        CREATE TYPE "UnitTypes" AS ENUM ('KG', 'G', 'CM', 'M');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

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
        // Column might already exist, ignore
        if (!error.message.includes("already exists")) {
          console.log(
            `  ⚠️  Could not add column ${col.name}: ${error.message}`,
          );
        }
      }
    }

    console.log("✅ Product table columns verified\n");
  }

  async fetchWordPressProducts(limit: number = 100, offset: number = 0) {
    console.log(
      `🔍 Fetching WordPress products (offset: ${offset}, limit: ${limit})...`,
    );

    // Simplified query without taxonomy joins - we'll fetch categories separately
    const query = `
      SELECT 
          p.ID as product_id,
          p.post_title as title,
          p.post_name as slug,
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
               p.post_author, p.post_date, p.post_modified, p.post_status, p.comment_status, p.post_name 

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
      // Get featured image
      if (featuredId) {
        const [result] = await this.wpConnection.query<mysql.RowDataPacket[]>(
          "SELECT guid FROM wp_posts WHERE ID = ? AND post_type = 'attachment'",
          [featuredId],
        );
        if (result.length > 0) {
          images.push(result[0].guid);
        }
      }

      // Get gallery images
      if (galleryIds) {
        const ids = galleryIds.split(",").map((id) => id.trim());
        for (const id of ids) {
          const [result] = await this.wpConnection.query<mysql.RowDataPacket[]>(
            "SELECT guid FROM wp_posts WHERE ID = ? AND post_type = 'attachment'",
            [id],
          );
          if (result.length > 0) {
            images.push(result[0].guid);
          }
        }
      }
    } catch (error) {
      console.log(`  ⚠️  Error fetching images: ${error}`);
    }

    return images;
  }

  /**
   * Parse PHP serialized _dokan_wholesale_meta
   * Format: a:3:{s:17:"enable_wholesale";s:3:"yes";s:5:"price";s:3:"100";s:8:"quantity";s:2:"10";}
   */
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

      // Extract enable_wholesale value
      const enableMatch = serialized.match(
        /s:17:"enable_wholesale";s:\d+:"([^"]+)"/,
      );
      if (enableMatch && enableMatch[1]) {
        wholesaleEnabled = enableMatch[1].toLowerCase() === "yes";
      }

      // Extract price value - handles both s:5:"price" and variations
      const priceMatch = serialized.match(/s:5:"price";s:\d+:"([^"]+)"/);
      if (priceMatch && priceMatch[1]) {
        const price = parseFloat(priceMatch[1]);
        wholesalePrice = isNaN(price) ? 0 : price;
      }

      // Extract quantity value
      const quantityMatch = serialized.match(/s:8:"quantity";s:\d+:"([^"]+)"/);
      if (quantityMatch && quantityMatch[1]) {
        const qty = parseInt(quantityMatch[1]);
        wholesaleQuantity = isNaN(qty) ? 0 : qty;
      }

      return { wholesaleEnabled, wholesalePrice, wholesaleQuantity };
    } catch (error) {
      console.log(`  ⚠️  Error parsing wholesale meta: ${error}`);
      return {
        wholesaleEnabled: false,
        wholesalePrice: 0,
        wholesaleQuantity: 0,
      };
    }
  }

  /**
   * Create ShippingMeasurements record for product weight
   * Returns the ID of the created record
   */
  async createShippingMeasurements(weight: number): Promise<number | null> {
    if (!weight || weight <= 0) return null;

    try {
      // Ensure table exists
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

      // Convert weight to integer (WordPress stores in KG as decimal)
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
      console.log(
        `  ⚠️  Error creating shipping measurements: ${error.message}`,
      );
      return null;
    }
  }

  parseTags(tagsString: string | null): string[] {
    if (!tagsString) return [];
    return tagsString.split("||").filter((tag) => tag && tag.trim());
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

  async insertProduct(product: any) {
    // Get images - thumbnail FIRST, then gallery
    const images = await this.getImageUrls(
      product.featured_image_id,
      product.gallery_image_ids,
    );

    // Parse wholesale meta (PHP serialized format)
    const { wholesaleEnabled, wholesalePrice, wholesaleQuantity } =
      this.parseWholesaleMeta(product.wholesale_meta);

    // Tags - already fetched as array from getProductTags
    const tags = Array.isArray(product.tags) ? product.tags : [];

    // Map VAT rate
    const vatRate =
      product.vat_rate === "reduced-rate" ||
      product.tax_class === "reduced-rate"
        ? "REDUCED"
        : "STANDARD";

    // Map stock status
    const inStock = product.stock_status === "instock";

    // Enable reviews
    const enableReviews = product.comment_status === "open";

    // Parse rating
    const rating = product.average_rating
      ? parseFloat(product.average_rating)
      : 0;

    // Stock quantity
    const stockQty = parseInt(product.stock_quantity || "0");

    // Total sales
    const totalSales = parseInt(product.total_sales_meta || "0");

    // Views
    const postViews = parseInt(product.post_views_count || "0");

    // Weight - parse and create ShippingMeasurements
    const weight = parseFloat(product.weight || "0");
    let shippingMeasurementsId: number | null = null;

    if (weight > 0) {
      shippingMeasurementsId = await this.createShippingMeasurements(weight);
    }

    const query = `
      INSERT INTO "Product" (
        id,
        title,
        description,
        mrsp,
        wholesale,
        "agreePrice",
        "discountedPrice",
        "from",
        "to",
        images,
        videos,
        sku,
        gtin,
        country,
        "vatRate",
        "tariffCode",
        "inStock",
        "onHand",
        committed,
        available,
        "hasOptions",
        "sellingMethod",
        "minimumOrderQuantity",
        "sameMeasurement",
        tags,
        "enableReviews",
        "letRetailersBuy",
        "letRetailersCustomize",
        "requiredCustomInfo",
        "productStatus",
        "vendorId",
        rattings,
        "createdAt",
        "updatedAt",
        "shortDescription",
        "geoAddress",
        "geoLatitude",
        "geoLongitude",
        "totalSales",
        "postViews",
        "wpStatus",
        "wholesaleMinQty",
        "shippingMeasurementsId",
        slug
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, 
        $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44
      )
    `;

    const values = [
      product.product_id, // id - Preserve WordPress ID
      product.title || "Untitled Product", // title
      product.description || "", // description
      parseFloat(product.mrsp || product.regular_price || "0"), // mrsp
      wholesalePrice, // wholesale
      false, // agreePrice
      parseFloat(product.discounted_price || "0"), // discountedPrice
      product.sale_from ? new Date(parseInt(product.sale_from) * 1000) : null, // from
      product.sale_to ? new Date(parseInt(product.sale_to) * 1000) : null, // to
      images, // images (array) - thumbnail first, then gallery
      [], // videos (empty array)
      product.sku || product.wc_sku || `PROD-${product.product_id}`, // sku
      product.gtin || "", // gtin
      product.country || "", // country
      vatRate, // vatRate
      product.tariff_code || "", // tariffCode
      inStock, // inStock
      stockQty, // onHand
      0, // committed
      stockQty, // available (same as onHand initially)
      false, // hasOptions
      "BY_ITEM", // sellingMethod
      parseInt(product.minimum_order_quantity || "1"), // minimumOrderQuantity
      false, // sameMeasurement
      tags, // tags (array)
      enableReviews, // enableReviews
      false, // letRetailersBuy
      false, // letRetailersCustomize
      false, // requiredCustomInfo
      product.product_status, // productStatus
      product.vendor_id, // vendorId
      rating, // rattings
      new Date(product.created_at), // createdAt
      new Date(product.updated_at), // updatedAt
      // Additional WordPress fields
      product.short_description || "", // shortDescription
      product.geo_address || null, // geoAddress
      product.geo_latitude ? parseFloat(product.geo_latitude) : null, // geoLatitude
      product.geo_longitude ? parseFloat(product.geo_longitude) : null, // geoLongitude
      totalSales, // totalSales
      postViews, // postViews
      product.wp_status || null, // wpStatus (original WordPress status)
      wholesaleQuantity, // wholesaleMinQty
      shippingMeasurementsId, // shippingMeasurementsId (link to ShippingMeasurements table)
      product.slug || null,
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
        // Check if category exists
        const catCheck = await this.pgClient.query(
          'SELECT id FROM "Category" WHERE id = $1',
          [parseInt(categoryId)],
        );

        if (catCheck.rows.length > 0) {
          // Insert into ProductCategory junction table
          await this.pgClient.query(
            `INSERT INTO "ProductCategory" ("productId", "categoryId", "createdAt", "updatedAt")
             VALUES ($1, $2, NOW(), NOW())
             ON CONFLICT DO NOTHING`,
            [productId, parseInt(categoryId)],
          );
          linked++;
        }
      } catch (error) {
        // Ignore duplicate errors
      }
    }

    return linked;
  }

  async migrateProduct(product: any) {
    try {
      // Check if product already exists
      const exists = await this.productExists(product.product_id);
      if (exists) {
        console.log(
          `⏭️  Skipping: ${product.title} (ID ${product.product_id} already exists)`,
        );
        this.stats.skipped++;
        return;
      }

      // Check if vendor exists
      const vendorExists = await this.vendorExists(product.vendor_id);
      if (!vendorExists) {
        console.log(
          `❌ Vendor ${product.vendor_id} not found for product: ${product.title}`,
        );
        this.stats.errors++;
        return;
      }

      // Fetch categories and tags separately (lighter queries)
      const categoryIds = await this.getProductCategories(product.product_id);
      const tags = await this.getProductTags(product.product_id);

      // Add to product object
      product.category_ids = categoryIds;
      product.tags = tags;

      // Insert product
      await this.insertProduct(product);

      // Link categories
      const categoriesLinked = await this.linkProductCategories(
        product.product_id,
        categoryIds,
      );

      this.stats.categories_linked += categoriesLinked;

      const productInfo = `${product.title} (ID: ${product.product_id})`;
      const categoryInfo =
        categoriesLinked > 0 ? ` + ${categoriesLinked} categories` : "";
      console.log(`✅ Migrated: ${productInfo}${categoryInfo}`);
      this.stats.success++;
    } catch (error: any) {
      console.error(
        `❌ Error migrating ${product.title} (ID ${product.product_id}):`,
        error.message,
      );
      this.stats.errors++;
    }
  }

  async updateSequence() {
    console.log("\n🔄 Updating Product ID sequence...");
    try {
      const maxIdQuery = 'SELECT MAX(id) as max_id FROM "Product"';
      const result = await this.pgClient.query(maxIdQuery);
      const maxId = result.rows[0].max_id || 0;

      const sequenceQuery = `SELECT setval('"Product_id_seq"', $1, true)`;
      await this.pgClient.query(sequenceQuery, [maxId]);

      console.log(`✅ Sequence updated to start from ${maxId + 1}\n`);
    } catch (error: any) {
      console.log("⚠️  Could not update sequence:", error.message);
    }
  }

  async run() {
    const BATCH_SIZE = 10;

    try {
      await this.connect();

      // Ensure all columns exist in Product table
      await this.ensureProductTableColumns();

      // Get total count first
      const totalCount = await this.getTotalProductCount();
      this.stats.total = totalCount;
      console.log(`📊 Found ${totalCount} total products\n`);

      console.log("🚀 Starting batch migration...\n");

      let offset = 0;
      let batchNum = 1;

      while (offset < totalCount) {
        console.log(
          `\n📦 Processing batch ${batchNum} (${offset + 1} - ${Math.min(
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

      await this.updateSequence();
      this.printSummary();
    } catch (error) {
      console.error("💥 Migration failed:", error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  printSummary() {
    console.log("\n" + "=".repeat(50));
    console.log("📈 Product Migration Summary");
    console.log("=".repeat(50));
    console.log(`Total products:        ${this.stats.total}`);
    console.log(`✅ Success:            ${this.stats.success}`);
    console.log(`⏭️  Skipped:            ${this.stats.skipped}`);
    console.log(`❌ Errors:             ${this.stats.errors}`);
    console.log(`🔗 Categories linked:  ${this.stats.categories_linked}`);
    console.log("=".repeat(50));

    if (this.stats.success > 0) {
      console.log("\n✅ Products migrated with:");
      console.log("   - Preserved WordPress IDs");
      console.log("   - All images fetched");
      console.log("   - Categories linked");
      console.log("   - Tags extracted");
      console.log("   - Wholesale prices parsed");
    }
  }
}

// Run migration
if (require.main === module) {
  const migration = new ProductMigration();
  migration
    .run()
    .then(() => {
      console.log("🎉 Product migration completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Migration failed:", error);
      process.exit(1);
    });
}

export default ProductMigration;
