const ECOMMERCE_API_URL = "https://api-ecommerce.hostinger.com";
const ECOMMERCE_STORE_ID = "store_01K1YVGRAAAV79HC0W0H1A02KQ";

export const formatCurrency = (priceInCents, currencyInfo) => {
	if (!currencyInfo || priceInCents === null || priceInCents === undefined) {
		return '';
	}

	const { code, symbol, template } = currencyInfo;
	const currencyDisplay = symbol || code || '€';
	const amount = (priceInCents / 100).toFixed(2);

	if (template) {
		return template.replace('$1', amount);
	}

	return `${currencyDisplay}${amount}`;
};

const extractVariantOptions = (options) => {
	return (options || []).map((opt) => ({
		id: opt?.id || "",
		option_id: opt?.option_id || "",
		variant_id: opt?.variant_id || "",
		value: opt?.value || "",
	}));
};

const extractProductOptions = (options) => {
	return (options || []).map((opt) => ({
		id: opt?.id || "",
		title: opt?.title || "",
		values: (opt?.values || []).map((val) => ({
			id: val?.id || "",
			option_id: val?.option_id || "",
			variant_id: val?.variant_id || "",
			value: val?.value || "",
		})),
	}));
};

const extractVariants = (variants) => {
	return (variants || []).map((v) => {
		const price_in_cents = v?.prices?.[0]?.amount || 0;
		const sale_price_in_cents = v?.prices?.[0]?.sale_amount || null;
		const currency = v?.prices?.[0]?.currency_code || "eur";

		return {
			id: v?.id || "",
			title: v?.title || "",
			image_url: v?.image_url || null,
			sku: v?.sku || null,
			price_in_cents,
			sale_price_in_cents,
			currency,
			price_in_cents_formatted: formatCurrency(price_in_cents, v?.prices?.[0]?.currency),
			sale_price_in_cents_formatted: formatCurrency(sale_price_in_cents, v?.prices?.[0]?.currency),
			manage_inventory: v?.manage_inventory || false, // track stock only if this flag is true
			weight: v?.weight || null,
			options: extractVariantOptions(v?.options),
			inventory_quantity: v?.inventory_quantity || null,
		};
	});
};

const extractImages = (images) => {
	return (images || []).map((img) => ({
		url: img?.url || "",
		order: img?.order || 0,
		type: img?.type || "",
	}));
};

const extractCollections = (collections) => {
	return (collections || []).map((col) => ({
		product_id: col?.product_id || "",
		collection_id: col?.collection_id || "",
		order: col?.order || 0,
	}));
};

const extractAdditionalInfo = (additionalInfo) => {
	return (additionalInfo || []).map((info) => ({
		id: info?.id || "",
		order: info?.order || 0,
		title: info?.title || "",
		description: info?.description || "",
	}));
};

const extractCustomFields = (customFields) => {
	return (customFields || []).map((field) => ({
		id: field?.id || "",
		title: field?.title || "",
		is_required: field?.is_required || false,
	}));
};

const extractRelatedProducts = (relatedProducts) => {
	return (relatedProducts || []).map((rel) => ({
		id: rel?.id || "",
		section_title: rel?.section_title || "",
		related_type: rel?.related_type || "",
		related_id: rel?.related_id || "",
		position: rel?.position || 0,
	}));
};

const getLowestPriceVariant = (product) =>
	product.variants.reduce((acc, curr) => {
		const accPrice = acc.prices[0]?.sale_amount || acc.prices[0]?.amount || 0;
		const currPrice =
			curr.prices[0]?.sale_amount || curr.prices[0]?.amount || 0;

		return accPrice < currPrice ? acc : curr;
	});

const getProductPrice = (product) => {
	const selectedVariant =
		product.site_product_selection === "lowest_price_first" ||
		product.site_product_selection === null
			? getLowestPriceVariant(product)
			: product.variants[0];

	const price_in_cents =
		selectedVariant?.prices[0]?.sale_amount ||
		selectedVariant?.prices[0]?.amount ||
		0;
	const currency = selectedVariant?.prices[0]?.currency_code || "eur";

	// price_in_cents is the price value in cents, make sure to convert it to a full price based on decimal_digits
	return { price_in_cents, currency };
};

/**
 * @typedef {Object} ProductVariant
 * @property {string} id - Unique variant identifier
 * @property {string} title - Variant name/title
 * @property {string|null} image_url - Variant-specific image URL
 * @property {string|null} sku - Stock keeping unit for inventory tracking
 * @property {number} price_in_cents - Price in cents in smallest currency unit (e.g., cents for USD)
 * @property {number|null} sale_price_in_cents - Discounted price in cents in smallest currency unit, if applicable
 * @property {string} currency - Currency code (e.g., "USD", "EUR")
 * @property {boolean} manage_inventory - Whether inventory is managed for product and/or variant. When true, stock should be tracked
 * @property {number|null} weight - Product weight in specified units
 * @property {Array<{id: string, option_id: string, variant_id: string, value: string}>} options - Variant-specific options
 * @property {number|null} inventory_quantity - Current inventory quantity for this variant. Track only if manage_inventory=true
 */

/**
 * @typedef {Object} ProductCollection
 * @property {string} product_id - Product identifier
 * @property {string} collection_id - Collection identifier
 * @property {number} order - Display order within the collection
 */

/**
 * @typedef {Object} ProductImage
 * @property {string} url - Image URL
 * @property {number} order - Display order for sorting images
 * @property {string} type - Image type/category
 */

/**
 * @typedef {Object} ProductOptionValue
 * @property {string} id - Unique option value identifier
 * @property {string} option_id - Parent option identifier
 * @property {string} variant_id - Associated variant identifier
 * @property {string} value - Option value text
 */

/**
 * @typedef {Object} ProductOption
 * @property {string} id - Unique option identifier
 * @property {string} title - Option name/title
 * @property {ProductOptionValue[]} values - Available option values
 */

/**
 * @typedef {Object} ProductAdditionalInfo
 * @property {string} id - Unique additional info identifier
 * @property {number} order - Display order for sorting
 * @property {string} title - Section title
 * @property {string} description - HTML content for additional information
 */

/**
 * @typedef {Object} ProductCustomField
 * @property {string} id - Unique custom field identifier
 * @property {string} title - Custom field name/title
 * @property {boolean} is_required - Whether this field is required for purchase
 */

/**
 * @typedef {Object} ProductRelatedProduct
 * @property {string} id - Unique related product identifier
 * @property {string} section_title - Section title for grouping related products
 * @property {string} related_type - Type of relationship (e.g., "similar", "accessory")
 * @property {string} related_id - ID of the related product
 * @property {number} position - Display position for ordering
 */

/**
 * @typedef {Object} ProductListResponse
 * @property {string} id - Unique product identifier
 * @property {string} title - Product title/name
 * @property {string|null} subtitle - Product subtitle
 * @property {string|null} ribbon_text - Ribbon text for display
 * @property {string} description - Product description (HTML)
 * @property {string} image - Thumbnail image URL
 * @property {number} price_in_cents - Selected variant price in cents
 * @property {string} currency - Selected variant currency code
 * @property {boolean} purchasable - Whether product can be purchased
 * @property {number} order - Display order (e.g., 1, 2, 3 for sorting products in lists)
 * @property {string|null} site_product_selection - Product selection strategy (lowest_price_first)
 * @property {ProductImage[]} images - Array of product images
 * @property {ProductOption[]} options - Product options
 * @property {ProductVariant[]} variants - Product variants
 * @property {ProductCollection[]} collections - Product collections
 * @property {ProductAdditionalInfo[]} additional_info - Additional product information
 * @property {{value: string}} type - Product type with value
 * @property {ProductCustomField[]} custom_fields - Custom product fields
 * @property {ProductRelatedProduct[]} related_products - Related/similar products
 * @property {string} updated_at - Last update timestamp
 */

/**
 * @typedef {Object} ProductResponse
 * @extends ProductListResponse
 * @property {string} status - Product status
 * @property {string} created_at - Creation timestamp
 * @property {string|null} deleted_at - Deletion timestamp
 * @property {Object.<string, string>} metadata - Product metadata
 * @property {{value: string}} type - Product type
 */

/**
 * @typedef {Object} GetProductsResponse
 * @property {number} count - Total number of products available
 * @property {number} offset - Current pagination offset
 * @property {number} limit - Maximum products in this response
 * @property {ProductListResponse[]} products - Array of product list objects
 */

/**
 * @typedef {Object} GetProductsParams
 * @property {string[]} [ids] - Array of Product Variant IDs to filter by (optional)
 * @property {string} [offset] - Number of products to skip for pagination (optional)
 * @property {string} [limit] - Maximum number of products to return (optional)
 * @property {string} [order] - Sort order, either "ASC" or "DESC" (optional)
 * @property {string} [sort_by] - Field name to sort products by (optional)
 * @property {boolean} [is_hidden] - Filter for hidden products only (optional)
 * @property {string} [to_date] - ISO date string to filter products updated before this date (optional)
 */

/**
 * @typedef {Object} GetProductParams
 * @property {string} [field] - Specific field to search product by instead of ID (optional)
 */

/**
 * @typedef {Object} VariantInventory
 * @property {string} id - Variant identifier
 * @property {number} inventory_quantity - Current inventory quantity for this variant. Track only if manage_inventory=true
 */

/**
 * @typedef {Object} GetProductQuantitiesResponse
 * @property {VariantInventory[]} variants - Array of variants with current inventory information
 */

/**
 * @typedef {Object} GetProductQuantitiesParams
 * @property {string} fields - Must be "inventory_quantity" (required)
 * @property {string[]} product_ids - Array of Product IDs to check inventory for (required)
 */

/**
 * @typedef {Object} CheckoutItemCustomFieldValue
 * @property {string} custom_field_id - Custom field identifier (required if custom_field_values provided)
 * @property {string} value - Custom field value for this item (required if custom_field_values provided)
 */

/**
 * @typedef {Object} CheckoutItem
 * @property {string} variant_id - Product variant identifier (required)
 * @property {number} quantity - Quantity to purchase, minimum 1 (required)
 * @property {CheckoutItemCustomFieldValue[]} [custom_field_values] - Array of custom field values for this item (optional)
 */

/**
 * @typedef {Object} InitializeCheckoutParams
 * @property {CheckoutItem[]} items - Array of items to checkout
 * @property {string} successUrl - URL for successful payment redirect (required)
 * @property {string} cancelUrl - URL for cancelled payment redirect (required)
 * @property {string} [locale] - Locale for checkout (e.g., "en", "es", "fr") (optional)
 */

/**
 * @typedef {Object} InitializeCheckoutResponse
 * @property {string} url - Checkout URL for customer payment processing
 */

/**
 * GET /store/{store_id}/products - List Products Endpoint
 * @function getProducts
 * @static
 * @operationId GetProducts
 * @summary List Products
 * @description Retrieve a paginated list of products with filtering options
 * @group Product
 *
 * @param {GetProductsParams} params - Query parameters object
 * @param {string[]} [params.ids] - Array of Product Variant IDs to filter by (optional)
 * @param {string} [params.offset] - Number of products to skip for pagination (optional)
 * @param {string} [params.limit] - Maximum number of products to return (optional)
 * @param {string} [params.order] - Sort order, either "ASC" or "DESC" (optional)
 * @param {string} [params.sort_by] - Field name to sort products by (optional)
 * @param {boolean} [params.is_hidden] - Filter for hidden products only (optional)
 * @param {string} [params.to_date] - ISO date string to filter products updated before this date (optional)
 *
 * @returns {Promise<GetProductsResponse>} Response object with paginated products
 */
export async function getProducts({ids, offset, limit, order, sort_by, is_hidden, to_date} = {}) {
	const queryParams = new URLSearchParams();

	if (ids) {
		ids.forEach((id) => {
			queryParams.append("ids[]", id);
		});
	}

	if (offset) {
		queryParams.append("offset", String(offset));
	}

	if (limit) {
		queryParams.append("limit", String(limit));
	}

	if (order) {
		queryParams.append("order", String(order));
	}

	if (sort_by) {
		queryParams.append("sort_by", String(sort_by));
	}

	if (is_hidden) {
		queryParams.append("is_hidden", String(is_hidden));
	}

	if (to_date) {
		queryParams.append("to_date", String(to_date));
	}

	const queryString = queryParams.toString();
	const url = `${ECOMMERCE_API_URL}/store/${ECOMMERCE_STORE_ID}/products${queryString ? `?${queryString}` : ""}`;

	const response = await fetch(url, {
		method: "GET",
		headers: {
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${response.statusText}`);
	}

	const data = await response.json();
	return {
		count: data.count,
		offset: data.offset,
		limit: data.limit,
		products: data.products.map((product) => {
			const { price_in_cents, currency } = getProductPrice(product);

			return {
				id: product.id,
				title: product.title,
				subtitle: product.subtitle,
				ribbon_text: product.ribbon_text,
				description: product.description,
				image: product.thumbnail,
				price_in_cents,
				currency,
				purchasable: product.purchasable,
				order: product.order,
				site_product_selection: product.site_product_selection,
				images: extractImages(product.images),
				options: extractProductOptions(product.options),
				variants: extractVariants(product.variants),
				collections: extractCollections(product.product_collections),
				additional_info: extractAdditionalInfo(product.additional_info),
				type: {
					value: product.type?.value || "",
				},
				custom_fields: extractCustomFields(product.custom_fields),
				related_products: extractRelatedProducts(product.related_products),
				updated_at: product.updated_at,
			};
		}),
	};
}

/**
 * GET /store/{store_id}/products/{id} - Get Single Product Endpoint
 * @function getProduct
 * @static
 * @operationId GetProductsProduct
 * @summary Retrieve a Product
 * @description Retrieve a single product by ID
 * @group Product
 *
 * @param {string} id - Product identifier
 * @param {GetProductParams} params - Query parameters object
 * @param {string} [params.field] - Specific field to search product by (optional)
 *
 * @returns {Promise<ProductResponse>} Normalized product object
 *
 * @example
 * const product = await getProduct("product_123", {
 *   field: "sku"
 * });
 */
export async function getProduct(id, {field} = {}) {
	const queryParams = new URLSearchParams();

	if (field) {
		queryParams.append("field", String(field));
	}

	const queryString = queryParams.toString();
	const url = `${ECOMMERCE_API_URL}/store/${ECOMMERCE_STORE_ID}/products/${id}${queryString ? `?${queryString}` : ""}`;

	const response = await fetch(url, {
		method: "GET",
		headers: {
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${response.statusText}`);
	}

	const data = await response.json();
	const product = data.product;

	const { price_in_cents, currency } = getProductPrice(product);

	return {
		id: product.id,
		title: product.title,
		subtitle: product.subtitle,
		ribbon_text: product.ribbon_text,
		description: product.description,
		image: product.thumbnail,
		price_in_cents,
		currency,
		status: product.status,
		purchasable: product.purchasable,
		order: product.order,
		site_product_selection: product.site_product_selection,
		images: extractImages(product.media),
		options: extractProductOptions(product.options),
		variants: extractVariants(product.variants),
		collections: extractCollections(product.product_collections),
		additional_info: extractAdditionalInfo(product.additional_info),
		type: {
			value: product.type?.value || "",
		},
		custom_fields: extractCustomFields(product.custom_fields),
		related_products: extractRelatedProducts(product.related_products),
		updated_at: product.updated_at,
		created_at: product.created_at,
		deleted_at: product.deleted_at,
		metadata: product.metadata,
	};
}

/**
 * GET /store/{store_id}/variants - Get Product Quantities Endpoint
 * @function getProductQuantities
 * @static
 * @operationId GetVariants
 * @summary Retrieve Product Variants
 * @description Retrieve a list of product variants with up-to-date inventory information to prevent out-of-stock purchases
 * @group ProductVariant
 *
 * @param {GetProductQuantitiesParams} params - Query parameters
 * @param {string} params.fields - Must be "inventory_quantity" (required)
 * @param {string[]} params.product_ids - Array of Product IDs to check inventory for (required)
 *
 * @returns {Promise<GetProductQuantitiesResponse>} Response object with variant inventory data
 *
 * @example
 * const result = await getProductQuantities({
 *   fields: "inventory_quantity",
 *   product_ids: ["product_123", "product_456", "product_789"]
 * });
 */
export async function getProductQuantities({fields, product_ids}) {
	const queryParams = new URLSearchParams();

	queryParams.append("fields", fields);

	product_ids.forEach((id) => {
		queryParams.append("product_ids[]", id);
	});

	const url = `${ECOMMERCE_API_URL}/store/${ECOMMERCE_STORE_ID}/variants?${queryParams.toString()}`;

	const response = await fetch(url, {
		method: "GET",
		headers: {
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${response.statusText}`);
	}

	const data = await response.json();

	// Track only if product variant manage_inventory=true
	return {
		variants: (data.variants || []).map((variant) => ({
			id: variant.id,
			inventory_quantity: variant.inventory_quantity,
		})),
	};
}

/**
 * POST /store/{store_id}/checkout - Initialize Checkout Endpoint
 * @function initializeCheckout
 * @static
 * @operationId PostInitializeCheckout
 * @summary Initialize Checkout
 * @description Initialize checkout/payment session for customer purchase. This endpoint creates a payment session and returns a checkout URL where customers can complete their payment.
 * @group Checkout
 *
 * @param {InitializeCheckoutParams} params - Checkout request parameters
 * @param {Array<Object>} params.items - Array of items to checkout
 * @param {string} params.items[].variant_id - Product variant identifier (required)
 * @param {number} params.items[].quantity - Quantity to purchase, minimum 1 (required)
 * @param {Array<Object>} [params.items[].custom_field_values] - Array of custom field values for this item (optional)
 * @param {string} params.items[].custom_field_values[].custom_field_id - Custom field identifier (required if custom_field_values provided)
 * @param {string} params.items[].custom_field_values[].value - Custom field value (required if custom_field_values provided)
 * @param {string} params.successUrl - URL for successful payment redirect (required)
 * @param {string} params.cancelUrl - URL for cancelled payment redirect (required)
 * @param {string} [params.locale] - Locale for checkout (e.g., "en", "es", "fr") (optional)
 *
 * @returns {Promise<InitializeCheckoutResponse>} Response object containing checkout URL
 *
 * @example
 * const result = await initializeCheckout({
 *   items: [
 *     {
 *       variant_id: "variant_123",
 *       quantity: 2,
 *       custom_field_values: [
 *         { custom_field_id: "field_1", value: "Personalization" }
 *       ]
 *     }
 *   ],
 *   successUrl: "https://example.com/success",
 *   cancelUrl: "https://example.com/cancel",
 *   locale: "en",
 * });
 */
export async function initializeCheckout({items, successUrl, cancelUrl, locale}) {
	const url = `${ECOMMERCE_API_URL}/store/${ECOMMERCE_STORE_ID}/checkout`;

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			items,
			successUrl,
			cancelUrl,
			locale,
			timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		}),
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${response.statusText}`);
	}

	const data = await response.json();

	return { url: data.url };
}
