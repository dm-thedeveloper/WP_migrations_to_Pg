/**
 * WordPress Product Attributes to ProductOptions Migration
 * Handles normalization of attribute names (colour→color, etc.)
 * Creates ProductOptions and links to Products
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
// All variations map to a single canonical name
const ATTRIBUTE_NORMALIZATION: { [key: string]: string } = {
  // Color variations
  color: "color",
  colour: "color",
  colors: "color",
  colours: "color",
  cor: "color", // Portuguese

  // Size variations
  size: "size",
  sizes: "size",
  talla: "size", // Spanish
  tamanho: "size", // Portuguese

  // Quantity/Set variations
  quantity: "quantity",
  "set of 2": "set_size",
  "set of 4": "set_size",
  set_of_2: "set_size",
  set_of_4: "set_size",

  // Other common attributes
  flavour: "flavor",
  flavours: "flavor",
  flavor: "flavor",
  flavors: "flavor",

  pattern: "pattern",
  patterns: "pattern",

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

interface AttributeData {
  productId: number;
  attributeType: string; // Normalized type (color, size, etc.)
  attributeValue: string;
}

interface MigrationStats {
  totalAttributes: number;
  optionsCreated: number;
  productsLinked: number;
  errors: number;
}

class ProductAttributesMigration {
  private wpConnection!: mysql.Connection;
  private pgClient!: Client;
  private stats: MigrationStats = {
    totalAttributes: 0,
    optionsCreated: 0,
    productsLinked: 0,
    errors: 0,
  };

  // Cache for ProductOptions IDs
  private optionsCache: Map<string, number> = new Map(); // "type:value" -> optionId

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

  // Normalize attribute name to canonical form
  normalizeAttributeName(name: string): string {
    const normalized = name.toLowerCase().trim().replace(/\s+/g, "_");
    return ATTRIBUTE_NORMALIZATION[normalized] || normalized;
  }

  async ensureProductOptionsTable() {
    console.log("📋 Ensuring ProductOptions table exists...");

    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS "ProductOptions" (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        values TEXT[] NOT NULL DEFAULT '{}'
      )
    `);

    // Add index for faster lookups
    await this.pgClient.query(`
      CREATE INDEX IF NOT EXISTS idx_productoptions_type ON "ProductOptions"(type)
    `);

    console.log("✅ ProductOptions table ready\n");
  }

  async fetchWordPressAttributes(): Promise<AttributeData[]> {
    console.log("🔍 Fetching WordPress product attributes...");

    // Get all pa_* taxonomy attributes
    const query = `
      SELECT 
        p.ID as product_id,
        REPLACE(tt.taxonomy, 'pa_', '') as attribute_type,
        t.name as attribute_value
      FROM wp_posts p
      JOIN wp_term_relationships tr ON p.ID = tr.object_id
      JOIN wp_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
      JOIN wp_terms t ON tt.term_id = t.term_id
      WHERE p.post_type = 'product'
        AND p.post_status IN ('publish', 'draft', 'pending', 'private')
        AND tt.taxonomy LIKE 'pa_%'
      ORDER BY p.ID, tt.taxonomy
    `;

    const [rows] = await this.wpConnection.query<mysql.RowDataPacket[]>(query);

    // Normalize attribute types
    const attributes: AttributeData[] = rows.map((row) => ({
      productId: row.product_id,
      attributeType: this.normalizeAttributeName(row.attribute_type),
      attributeValue: row.attribute_value.trim(),
    }));

    console.log(`📊 Found ${attributes.length} attribute assignments\n`);
    return attributes;
  }

  async fetchVariationAttributes(): Promise<AttributeData[]> {
    console.log(
      "🔍 Fetching product variation attributes from post_excerpt...",
    );

    // Get variation attributes from post_excerpt
    const query = `
      SELECT 
        p.post_parent as product_id,
        p.post_excerpt as attributes_text
      FROM wp_posts p
      WHERE p.post_type = 'product_variation'
        AND p.post_excerpt IS NOT NULL
        AND p.post_excerpt != ''
    `;

    const [rows] = await this.wpConnection.query<mysql.RowDataPacket[]>(query);

    const attributes: AttributeData[] = [];

    for (const row of rows) {
      // Parse format: "color: Bronze\nSize: XS" or "Colour,size: Red, Large"
      const lines = row.attributes_text.split(/[\n,]+/);

      for (const line of lines) {
        const parts = line.split(":");
        if (parts.length >= 2) {
          const type = this.normalizeAttributeName(parts[0]);
          const value = parts[1].trim();

          if (type && value) {
            attributes.push({
              productId: row.product_id,
              attributeType: type,
              attributeValue: value,
            });
          }
        }
      }
    }

    console.log(`📊 Found ${attributes.length} variation attributes\n`);
    return attributes;
  }

  /**
   * Parse PHP serialized _product_attributes meta
   * Format: a:1:{s:8:"pa_color";a:6:{s:4:"name";s:8:"pa_color";s:5:"value";s:0:"";s:8:"position";i:0;s:10:"is_visible";i:1;s:12:"is_variation";i:1;s:11:"is_taxonomy";i:1;}}
   */
  async fetchProductAttributesMeta(): Promise<AttributeData[]> {
    console.log("🔍 Fetching _product_attributes meta (PHP serialized)...");

    const query = `
      SELECT 
        pm.post_id as product_id,
        pm.meta_value as attributes_serialized
      FROM wp_postmeta pm
      JOIN wp_posts p ON pm.post_id = p.ID
      WHERE pm.meta_key = '_product_attributes'
        AND pm.meta_value IS NOT NULL
        AND pm.meta_value != ''
        AND pm.meta_value != 'a:0:{}'
        AND p.post_type = 'product'
        AND p.post_status IN ('publish', 'draft', 'pending', 'private')
    `;

    const [rows] = await this.wpConnection.query<mysql.RowDataPacket[]>(query);
    const attributes: AttributeData[] = [];

    for (const row of rows) {
      try {
        const parsed = this.parsePhpSerializedAttributes(
          row.attributes_serialized,
        );

        for (const attr of parsed) {
          attributes.push({
            productId: row.product_id,
            attributeType: this.normalizeAttributeName(
              attr.name.replace("pa_", ""),
            ),
            attributeValue: attr.value,
          });
        }
      } catch (e) {
        // Skip unparseable entries
      }
    }

    console.log(
      `📊 Found ${attributes.length} attributes from _product_attributes meta\n`,
    );
    return attributes;
  }

  /**
   * Parse PHP serialized array for product attributes
   * Extracts attribute names and their values
   */
  parsePhpSerializedAttributes(
    serialized: string,
  ): Array<{ name: string; value: string }> {
    const results: Array<{ name: string; value: string }> = [];

    if (!serialized || serialized === "a:0:{}") return results;

    try {
      // Extract attribute names (pa_color, pa_size, etc.)
      // Pattern matches: s:8:"pa_color";a:6:{...}
      const attrPattern =
        /s:\d+:"(pa_[^"]+)";a:\d+:\{([^}]+(?:\{[^}]*\})*[^}]*)\}/g;
      let match;

      while ((match = attrPattern.exec(serialized)) !== null) {
        const attrName = match[1]; // e.g., "pa_color"
        const attrContent = match[2]; // The content inside the attribute array

        // Check if it has values (non-taxonomy attributes store value directly)
        // Pattern: s:5:"value";s:X:"actual_value"
        const valueMatch = attrContent.match(/s:5:"value";s:\d+:"([^"]+)"/);

        if (valueMatch && valueMatch[1]) {
          // Non-taxonomy attribute with direct value
          const values = valueMatch[1]
            .split("|")
            .map((v) => v.trim())
            .filter((v) => v);
          for (const value of values) {
            results.push({ name: attrName, value });
          }
        }
      }
    } catch (e) {
      // Return empty if parsing fails
    }

    return results;
  }

  async getOrCreateProductOption(type: string, value: string): Promise<number> {
    const cacheKey = `${type}:${value}`;

    // Check cache first
    if (this.optionsCache.has(cacheKey)) {
      return this.optionsCache.get(cacheKey)!;
    }

    // Check if option exists with this type and value
    const checkQuery = `
      SELECT id FROM "ProductOptions" 
      WHERE type = $1 AND $2 = ANY(values)
      LIMIT 1
    `;
    const checkResult = await this.pgClient.query(checkQuery, [type, value]);

    if (checkResult.rows.length > 0) {
      const optionId = checkResult.rows[0].id;
      this.optionsCache.set(cacheKey, optionId);
      return optionId;
    }

    // Check if option exists with this type (to add value to existing)
    const typeCheckQuery = `
      SELECT id, values FROM "ProductOptions" 
      WHERE type = $1
      LIMIT 1
    `;
    const typeResult = await this.pgClient.query(typeCheckQuery, [type]);

    if (typeResult.rows.length > 0) {
      // Add value to existing option
      const optionId = typeResult.rows[0].id;
      const existingValues = typeResult.rows[0].values || [];

      if (!existingValues.includes(value)) {
        await this.pgClient.query(
          `UPDATE "ProductOptions" SET values = array_append(values, $1) WHERE id = $2`,
          [value, optionId],
        );
      }

      this.optionsCache.set(cacheKey, optionId);
      return optionId;
    }

    // Create new option
    const insertQuery = `
      INSERT INTO "ProductOptions" (type, values)
      VALUES ($1, ARRAY[$2])
      RETURNING id
    `;
    const insertResult = await this.pgClient.query(insertQuery, [type, value]);
    const newOptionId = insertResult.rows[0].id;

    this.optionsCache.set(cacheKey, newOptionId);
    this.stats.optionsCreated++;

    return newOptionId;
  }

  async linkProductToOption(productId: number, optionId: number) {
    try {
      // Check if product exists
      const productCheck = await this.pgClient.query(
        'SELECT id, "productOptionsId" FROM "Product" WHERE id = $1',
        [productId],
      );

      if (productCheck.rows.length === 0) {
        return; // Product not migrated yet
      }

      // Update product with option link (only if not already set)
      if (!productCheck.rows[0].productOptionsId) {
        await this.pgClient.query(
          'UPDATE "Product" SET "productOptionsId" = $1, "hasOptions" = true WHERE id = $2',
          [optionId, productId],
        );
        this.stats.productsLinked++;
      }
    } catch (error: any) {
      // Ignore errors (product might not exist)
    }
  }

  async run() {
    try {
      await this.connect();
      await this.ensureProductOptionsTable();

      // Fetch all attributes from different sources
      const taxonomyAttributes = await this.fetchWordPressAttributes();
      const variationAttributes = await this.fetchVariationAttributes();
      const metaAttributes = await this.fetchProductAttributesMeta();

      // Combine all sources
      const allAttributes = [
        ...taxonomyAttributes,
        ...variationAttributes,
        ...metaAttributes,
      ];
      this.stats.totalAttributes = allAttributes.length;

      // Group attributes by product
      const productAttributes = new Map<number, Map<string, Set<string>>>();

      for (const attr of allAttributes) {
        if (!productAttributes.has(attr.productId)) {
          productAttributes.set(attr.productId, new Map());
        }
        const productAttrMap = productAttributes.get(attr.productId)!;

        if (!productAttrMap.has(attr.attributeType)) {
          productAttrMap.set(attr.attributeType, new Set());
        }
        productAttrMap.get(attr.attributeType)!.add(attr.attributeValue);
      }

      console.log(
        `📦 Processing attributes for ${productAttributes.size} products...\n`,
      );

      // Process each product's attributes
      let processed = 0;
      for (const [productId, attrMap] of productAttributes) {
        for (const [type, values] of attrMap) {
          for (const value of values) {
            try {
              const optionId = await this.getOrCreateProductOption(type, value);
              await this.linkProductToOption(productId, optionId);
            } catch (error: any) {
              this.stats.errors++;
            }
          }
        }

        processed++;
        if (processed % 500 === 0) {
          console.log(
            `  Processed ${processed}/${productAttributes.size} products...`,
          );
        }
      }

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
    console.log("📈 Product Attributes Migration Summary");
    console.log("=".repeat(50));
    console.log(`Total attribute assignments: ${this.stats.totalAttributes}`);
    console.log(`✅ ProductOptions created:   ${this.stats.optionsCreated}`);
    console.log(`🔗 Products linked:          ${this.stats.productsLinked}`);
    console.log(`❌ Errors:                   ${this.stats.errors}`);
    console.log("=".repeat(50));

    console.log("\n📋 Attribute Normalization Applied:");
    console.log("   colour, colors, colours → color");
    console.log("   sizes, talla → size");
    console.log("   flavours → flavor");
    console.log("   etc.");
  }
}

// Run migration
if (require.main === module) {
  const migration = new ProductAttributesMigration();

  migration
    .run()
    .then(() => {
      console.log("\n🎉 Product attributes migration completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Migration failed:", error);
      process.exit(1);
    });
}

export default ProductAttributesMigration;
