/**
 * Add ProductOptions to Existing Products
 *
 * This script:
 * - Analyzes existing ProductOptions table structure
 * - Handles migration from OLD schema (productOptionsId on Product) to NEW schema (productId on ProductOptions)
 * - Preserves existing ProductOptions data where possible
 * - Reads existing products from PostgreSQL
 * - Fetches their attributes from WordPress using the SAME product ID
 * - Creates ProductOptions rows linked to the correct product
 *
 * ProductOptions are NOT shared between products - each product gets its OWN options
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

interface ExistingOptionLink {
  productId: number;
  optionId: number;
  optionType: string;
  optionValues: string[];
}

interface MigrationStats {
  totalProducts: number;
  productsWithOptions: number;
  productsWithoutOptions: number;
  optionsCreated: number;
  productsAlreadyHaveOptions: number;
  existingOptionsMigrated: number;
  existingOptionsPreserved: number;
  errors: number;
}

class AddProductOptions {
  private wpConnection!: mysql.Connection;
  private pgClient!: Client;
  private stats: MigrationStats = {
    totalProducts: 0,
    productsWithOptions: 0,
    productsWithoutOptions: 0,
    optionsCreated: 0,
    productsAlreadyHaveOptions: 0,
    existingOptionsMigrated: 0,
    existingOptionsPreserved: 0,
    errors: 0,
  };

  // Cache of existing option links (from old schema)
  private existingOptionLinks: Map<number, ExistingOptionLink[]> = new Map();

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
  // PHASE 0: Analyze Existing Data Structure
  // =====================================================

  async analyzeExistingData() {
    console.log("🔍 Phase 0: Analyzing existing ProductOptions data...\n");

    // Check if ProductOptions table exists
    const tableCheck = await this.pgClient.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'ProductOptions'
      ) as exists
    `);

    if (!tableCheck.rows[0].exists) {
      console.log(
        "  📋 ProductOptions table does not exist yet - will create\n",
      );
      return {
        hasTable: false,
        hasProductIdColumn: false,
        existingCount: 0,
        linkedProducts: 0,
      };
    }

    // Check table structure - does it have productId column?
    const columnCheck = await this.pgClient.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'ProductOptions'
    `);

    const columns = columnCheck.rows.map((r) => r.column_name);
    const hasProductIdColumn = columns.includes("productId");

    console.log(`  📋 ProductOptions columns: ${columns.join(", ")}`);
    console.log(
      `  📋 Has productId column: ${hasProductIdColumn ? "YES" : "NO"}`,
    );

    // Count existing ProductOptions
    const countResult = await this.pgClient.query(
      `SELECT COUNT(*) as count FROM "ProductOptions"`,
    );
    const existingCount = parseInt(countResult.rows[0].count);
    console.log(`  📊 Existing ProductOptions rows: ${existingCount}`);

    // Check if Product table has productOptionsId column (OLD schema)
    const productColumnCheck = await this.pgClient.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Product' AND column_name = 'productOptionsId'
    `);
    const hasOldProductOptionsId = productColumnCheck.rows.length > 0;
    console.log(
      `  📋 Product has old productOptionsId: ${
        hasOldProductOptionsId ? "YES" : "NO"
      }`,
    );

    // If old schema exists, fetch existing links
    let linkedProducts = 0;
    if (hasOldProductOptionsId && existingCount > 0) {
      const linkedResult = await this.pgClient.query(`
        SELECT p.id as product_id, p."productOptionsId" as option_id, 
               po.type, po.values
        FROM "Product" p
        JOIN "ProductOptions" po ON p."productOptionsId" = po.id
        WHERE p."productOptionsId" IS NOT NULL
      `);

      linkedProducts = linkedResult.rows.length;
      console.log(`  🔗 Products linked via old schema: ${linkedProducts}`);

      // Store existing links for migration
      for (const row of linkedResult.rows) {
        const link: ExistingOptionLink = {
          productId: row.product_id,
          optionId: row.option_id,
          optionType: row.type,
          optionValues: row.values || [],
        };

        if (!this.existingOptionLinks.has(row.product_id)) {
          this.existingOptionLinks.set(row.product_id, []);
        }
        this.existingOptionLinks.get(row.product_id)!.push(link);
      }
    }

    console.log("");
    return {
      hasTable: true,
      hasProductIdColumn,
      existingCount,
      linkedProducts,
      hasOldProductOptionsId,
    };
  }

  // =====================================================
  // PHASE 1: Migrate/Ensure ProductOptions Table
  // =====================================================

  async ensureProductOptionsTable(analysisResult: any) {
    console.log("📋 Phase 1: Setting up ProductOptions table...\n");

    const {
      hasTable,
      hasProductIdColumn,
      existingCount,
      hasOldProductOptionsId,
    } = analysisResult;

    if (!hasTable) {
      // Create fresh table with new schema
      await this.pgClient.query(`
        CREATE TABLE "ProductOptions" (
          id SERIAL PRIMARY KEY,
          type TEXT NOT NULL,
          values TEXT[] NOT NULL DEFAULT '{}',
          "productId" INTEGER NOT NULL,
          CONSTRAINT fk_productoptions_product FOREIGN KEY ("productId") 
            REFERENCES "Product"(id) ON DELETE CASCADE
        )
      `);
      console.log("  ✅ Created ProductOptions table with productId column\n");
    } else if (!hasProductIdColumn) {
      // Table exists but without productId - need to migrate
      console.log("  🔄 Migrating existing ProductOptions to new schema...\n");

      // Add productId column (nullable first)
      await this.pgClient.query(`
        ALTER TABLE "ProductOptions" 
        ADD COLUMN IF NOT EXISTS "productId" INTEGER
      `);

      // If there are existing links from old schema, migrate them
      if (this.existingOptionLinks.size > 0) {
        console.log(
          `  📦 Migrating ${this.existingOptionLinks.size} existing product-option links...\n`,
        );

        for (const [productId, links] of this.existingOptionLinks) {
          for (const link of links) {
            // Update the existing ProductOptions row with productId
            await this.pgClient.query(
              `
              UPDATE "ProductOptions" SET "productId" = $1 WHERE id = $2
            `,
              [productId, link.optionId],
            );
            this.stats.existingOptionsMigrated++;
          }
        }
        console.log(
          `  ✅ Migrated ${this.stats.existingOptionsMigrated} existing option links\n`,
        );
      }

      // Handle orphaned ProductOptions (no product linked)
      // These were shared options - we need to duplicate them for each product that needs them
      // For now, we'll delete orphans and recreate from WordPress
      const orphanResult = await this.pgClient.query(`
        SELECT id, type, values FROM "ProductOptions" WHERE "productId" IS NULL
      `);

      if (orphanResult.rows.length > 0) {
        console.log(
          `  ⚠️  Found ${orphanResult.rows.length} orphaned ProductOptions (shared options)`,
        );
        console.log(
          `  🗑️  Removing orphans - will recreate from WordPress data\n`,
        );
        await this.pgClient.query(
          `DELETE FROM "ProductOptions" WHERE "productId" IS NULL`,
        );
      }

      // Now make productId NOT NULL and add foreign key
      await this.pgClient.query(`
        ALTER TABLE "ProductOptions" 
        ALTER COLUMN "productId" SET NOT NULL
      `);

      // Add foreign key if not exists
      try {
        await this.pgClient.query(`
          ALTER TABLE "ProductOptions"
          ADD CONSTRAINT fk_productoptions_product 
          FOREIGN KEY ("productId") REFERENCES "Product"(id) ON DELETE CASCADE
        `);
      } catch (e) {
        // Constraint might already exist
      }
    } else {
      console.log("  ✅ ProductOptions table already has correct schema\n");

      // Count how many products already have options
      const existingResult = await this.pgClient.query(`
        SELECT COUNT(DISTINCT "productId") as count FROM "ProductOptions"
      `);
      this.stats.existingOptionsPreserved = parseInt(
        existingResult.rows[0].count,
      );
      console.log(
        `  📊 ${this.stats.existingOptionsPreserved} products already have options\n`,
      );
    }

    // Create indexes
    await this.pgClient.query(`
      CREATE INDEX IF NOT EXISTS idx_productoptions_productid ON "ProductOptions"("productId")
    `);
    await this.pgClient.query(`
      CREATE INDEX IF NOT EXISTS idx_productoptions_type ON "ProductOptions"(type)
    `);

    // Remove old productOptionsId column from Product if it exists
    if (hasOldProductOptionsId) {
      console.log(
        "  🗑️  Removing old productOptionsId column from Product table...",
      );
      try {
        await this.pgClient.query(`
          ALTER TABLE "Product" DROP COLUMN IF EXISTS "productOptionsId"
        `);
        console.log("  ✅ Removed old productOptionsId column\n");
      } catch (e) {
        console.log(
          "  ⚠️  Could not remove old column (may have dependencies)\n",
        );
      }
    }

    console.log("✅ ProductOptions table ready\n");
  }

  // =====================================================
  // PHASE 2: Fetch Existing Products from PostgreSQL
  // =====================================================

  async fetchExistingProducts(): Promise<number[]> {
    console.log("📋 Phase 2: Fetching existing products from PostgreSQL...\n");

    const result = await this.pgClient.query(`
      SELECT id FROM "Product" ORDER BY id
    `);

    const productIds = result.rows.map((row) => row.id);
    console.log(`📊 Found ${productIds.length} existing products\n`);

    return productIds;
  }

  // =====================================================
  // PHASE 3: Check if Product Already Has Options
  // =====================================================

  async productHasOptions(productId: number): Promise<boolean> {
    const result = await this.pgClient.query(
      `
      SELECT COUNT(*) as count FROM "ProductOptions" WHERE "productId" = $1
    `,
      [productId],
    );

    return parseInt(result.rows[0].count) > 0;
  }

  // =====================================================
  // PHASE 4: Fetch WordPress Attributes for a Product
  // =====================================================

  normalizeAttributeName(name: string): string {
    const normalized = name.toLowerCase().trim().replace(/\s+/g, "_");
    return ATTRIBUTE_NORMALIZATION[normalized] || normalized;
  }

  async fetchProductAttributes(
    productId: number,
  ): Promise<Map<string, string[]>> {
    const attributesMap = new Map<string, string[]>();

    // 1. Fetch taxonomy attributes (pa_color, pa_size, etc.) for THIS product
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

    // 2. Fetch variation attributes from child variations of THIS product
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

    // 3. Parse _product_attributes meta for custom attributes of THIS product
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
  // PHASE 5: Create ProductOptions for a Product
  // =====================================================

  async createProductOptions(
    productId: number,
    attributesMap: Map<string, string[]>,
  ): Promise<number> {
    let optionsCreated = 0;

    for (const [type, values] of attributesMap) {
      if (values.length === 0) continue;

      try {
        // Create a ProductOptions record for THIS product with THIS type
        // Each row is unique to this product - not shared with other products
        await this.pgClient.query(
          `
          INSERT INTO "ProductOptions" (type, values, "productId")
          VALUES ($1, $2, $3)
        `,
          [type, values, productId],
        );

        optionsCreated++;
        this.stats.optionsCreated++;
      } catch (error: any) {
        console.log(
          `    ⚠️  Error creating option ${type} for product ${productId}: ${error.message}`,
        );
        this.stats.errors++;
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
  // PHASE 6: Process Each Product
  // =====================================================

  async processProduct(productId: number, index: number, total: number) {
    try {
      // Check if product already has options
      const hasOptions = await this.productHasOptions(productId);
      if (hasOptions) {
        this.stats.productsAlreadyHaveOptions++;
        return;
      }

      // Fetch attributes from WordPress for THIS specific product
      const attributes = await this.fetchProductAttributes(productId);

      if (attributes.size === 0) {
        this.stats.productsWithoutOptions++;
        return;
      }

      // Create ProductOptions rows for this product
      const optionsCreated = await this.createProductOptions(
        productId,
        attributes,
      );

      if (optionsCreated > 0) {
        this.stats.productsWithOptions++;

        // Log progress for products with options
        const attrTypes = Array.from(attributes.keys()).join(", ");
        console.log(
          `✅ Product ${productId}: ${optionsCreated} options (${attrTypes})`,
        );
      }
    } catch (error: any) {
      console.log(`❌ Error processing product ${productId}: ${error.message}`);
      this.stats.errors++;
    }
  }

  // =====================================================
  // PHASE 7: Update Sequence
  // =====================================================

  async updateSequence() {
    console.log("\n🔄 Updating ProductOptions sequence...");

    try {
      const result = await this.pgClient.query(
        'SELECT MAX(id) as max_id FROM "ProductOptions"',
      );
      const maxId = result.rows[0].max_id || 0;

      if (maxId > 0) {
        await this.pgClient.query(
          `SELECT setval('"ProductOptions_id_seq"', $1, true)`,
          [maxId],
        );
        console.log(`✅ Sequence updated to start from ${maxId + 1}`);
      }
    } catch (error: any) {
      console.log("⚠️  Could not update sequence:", error.message);
    }
  }

  // =====================================================
  // MAIN RUN
  // =====================================================

  async run() {
    try {
      await this.connect();

      // Phase 0: Analyze existing data structure
      const analysisResult = await this.analyzeExistingData();

      // Phase 1: Setup/migrate ProductOptions table
      await this.ensureProductOptionsTable(analysisResult);

      // Phase 2: Get all existing product IDs from PostgreSQL
      const productIds = await this.fetchExistingProducts();
      this.stats.totalProducts = productIds.length;

      console.log(
        "🚀 Phase 3: Adding ProductOptions to existing products...\n",
      );
      console.log("⚠️  Each product gets its OWN options (not shared)\n");

      // Process each product
      for (let i = 0; i < productIds.length; i++) {
        const productId = productIds[i];
        await this.processProduct(productId, i + 1, productIds.length);

        // Progress indicator every 500 products
        if ((i + 1) % 500 === 0) {
          console.log(
            `\n📊 Progress: ${i + 1}/${productIds.length} products processed\n`,
          );
        }
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
    console.log("\n" + "=".repeat(60));
    console.log("📈 Add ProductOptions Summary");
    console.log("=".repeat(60));
    console.log(`Total products checked:     ${this.stats.totalProducts}`);
    console.log(
      `✅ Products got options:    ${this.stats.productsWithOptions}`,
    );
    console.log(
      `⏭️  No attributes in WP:     ${this.stats.productsWithoutOptions}`,
    );
    console.log(
      `⏭️  Already had options:     ${this.stats.productsAlreadyHaveOptions}`,
    );
    console.log(
      `🔄 Existing migrated:       ${this.stats.existingOptionsMigrated}`,
    );
    console.log(
      `📦 Existing preserved:      ${this.stats.existingOptionsPreserved}`,
    );
    console.log(`🎨 New options created:     ${this.stats.optionsCreated}`);
    console.log(`❌ Errors:                  ${this.stats.errors}`);
    console.log("=".repeat(60));

    console.log("\n📋 ProductOptions Structure:");
    console.log("   - Each ProductOptions row belongs to ONE product");
    console.log("   - productId links to the specific Product");
    console.log("   - Options are NOT shared between products");
    console.log("   - Product 123: color [Red, Blue] → separate row");
    console.log("   - Product 123: size [S, M, L] → separate row");
    console.log("   - Product 456: color [Green] → different row");
  }
}

// Run migration
if (require.main === module) {
  const migration = new AddProductOptions();

  migration
    .run()
    .then(() => {
      console.log("\n🎉 ProductOptions migration completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Migration failed:", error);
      process.exit(1);
    });
}

export default AddProductOptions;
