const mysql = require("mysql2/promise");

async function run() {
  const connection = await mysql.createConnection({
    host: "srv447.hstgr.io",
    user: "u758272264_NW_DB",
    password: "Aeiou@123",
    database: "u758272264_NW_DB",
  });

  const query = `
    SELECT 
    u.ID as user_id,
    u.user_login as name,

    -- fixed hash instead of real WP password
    '$2a$10$sVMsMf2voDqKnCBWeGzZXO/jP3IzpNQMP0Wu763SDhrVbCUS.q1Xa' as password,

    u.user_nicename as fullName,
    u.user_email as email,
    u.user_url as user_url,
    u.display_name as displayName,

    MAX(CASE WHEN um.meta_key = 'billing_address_1' THEN um.meta_value END) as address,
    MAX(CASE WHEN um.meta_key = 'billing_city' THEN um.meta_value END) as city,
    MAX(CASE WHEN um.meta_key = 'billing_company' THEN um.meta_value END) as company,
    MAX(CASE WHEN um.meta_key = 'billing_country' THEN um.meta_value END) as country,
    MAX(CASE WHEN um.meta_key = 'billing_dokan_bank_iban' THEN um.meta_value END) as bank_iban,
    MAX(CASE WHEN um.meta_key = 'billing_dokan_bank_name' THEN um.meta_value END) as bank_name,
    MAX(CASE WHEN um.meta_key = 'billing_dokan_company_id_number' THEN um.meta_value END) as dokan_company_id_number,
    MAX(CASE WHEN um.meta_key = 'billing_postcode' THEN um.meta_value END) as zipCode,
    MAX(CASE WHEN um.meta_key = 'billing_state' THEN um.meta_value END) as state,
    MAX(CASE WHEN um.meta_key = 'billing_apartment' THEN um.meta_value END) as apartment,
    MAX(CASE WHEN um.meta_key = 'billing_address_2' THEN um.meta_value END) as street,
    MAX(CASE WHEN um.meta_key = 'first_name' THEN um.meta_value END) as first_name,
    MAX(CASE WHEN um.meta_key = 'last_name' THEN um.meta_value END) as last_name,
    MAX(CASE WHEN um.meta_key = 'nickname' THEN um.meta_value END) as nickname,
    MAX(CASE WHEN um.meta_key = 'vat_number' THEN um.meta_value END) as vatNumber,
    MAX(CASE WHEN um.meta_key = 'shop_activity' THEN um.meta_value END) as shop_activity,

    -- Store/Vendor specific fields
    MAX(CASE WHEN um.meta_key = 'dokan_profile_settings' THEN um.meta_value END) as dokan_profile_settings,
    MAX(CASE WHEN um.meta_key = 'dokan_store_name' THEN um.meta_value END) as store_name,
    MAX(CASE WHEN um.meta_key = '_store_phone' THEN um.meta_value END) as store_phone,

    -- 🎭 role resolution from wp_capabilities (priority-based: admin > seller > customer)
    CASE
        -- Priority 1: Administrator (highest)
        WHEN MAX(CASE WHEN um.meta_key = 'wp_capabilities' THEN um.meta_value END)
             LIKE '%administrator%' 
            THEN 'ADMIN'

        -- Priority 2: Seller/Vendor
        WHEN MAX(CASE WHEN um.meta_key = 'wp_capabilities' THEN um.meta_value END)
             LIKE '%seller%' 
            THEN 'VENDOR'

        -- Priority 3: Customer (default)
        WHEN MAX(CASE WHEN um.meta_key = 'wp_capabilities' THEN um.meta_value END)
             LIKE '%customer%'
            THEN 'BUYER'

        -- Priority 4: Wholesale customer
        WHEN MAX(CASE WHEN um.meta_key = 'wp_capabilities' THEN um.meta_value END)
             LIKE '%dokan_wholesale_customer%'
            THEN 'BUYER'

        -- Default: Buyer
        ELSE 'BUYER'
    END AS role,

    -- optional: keep raw capabilities if you want to inspect/debug
    MAX(CASE WHEN um.meta_key = 'wp_capabilities' THEN um.meta_value END) as wp_capabilities,

    wcl.first_name as customer_first_name,
    wcl.last_name as customer_last_name,
    wcl.email as customer_email,
    wcl.country as customer_country,
    wcl.postcode as customer_postcode,
    wcl.city as customer_city,
    wcl.state as customer_state

FROM wp_users u
LEFT JOIN wp_usermeta um 
    ON u.ID = um.user_id 
    AND um.meta_key IN (
        'billing_address_1',
        'billing_city',
        'billing_company',
        'billing_country',
        'billing_dokan_bank_iban',
        'billing_dokan_bank_name',
        'billing_dokan_company_id_number',
        'billing_postcode',
        'billing_state',
        'billing_apartment',
        'billing_address_2',
        'first_name',
        'last_name',
        'nickname',
        'vat_number',
        'shop_activity',
        'wp_capabilities',
        'dokan_profile_settings',
        'dokan_store_name',
        '_store_phone'
    )
LEFT JOIN wp_wc_customer_lookup wcl 
    ON u.ID = wcl.user_id
WHERE u.deleted = 0 AND u.spam = 0
GROUP BY u.ID
ORDER BY u.ID;


  `;

  const [rows] = await connection.execute(query);

  console.log(`Found ${rows.length} users`);
  console.log(JSON.stringify(rows, null, 2));

  await connection.end();
}

run().catch(console.error);
