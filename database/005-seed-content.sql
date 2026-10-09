INSERT INTO settings(key,value,description) VALUES('currency','USD','Store currency; all amounts are integer USD cents') ON CONFLICT(key) DO UPDATE SET value='USD';
INSERT INTO content_blocks(block_key,title,subtitle,body,image_url,cta_label,cta_url) VALUES
('hero-02',E'Colour, in its\npurest form','THE GEMSTONE COLLECTION','Discover stones chosen for their character, colour and natural beauty.','/assets/gem-larimar.jpeg','DISCOVER GEMSTONES','/gemstones'),
('hero-03',E'Made to be\ntreasured','THOUGHTFULLY CRAFTED','Meaningful details. Natural gemstones. Find a piece that feels like you.','/assets/signature-turquoise.jpeg','EXPLORE JEWELLERY','/jewellery') ON CONFLICT(block_key) DO NOTHING;
UPDATE products SET category_id=(SELECT id FROM categories WHERE slug=CASE WHEN products.kind='gemstone' THEN 'natural-gemstones' ELSE 'pendants' END) WHERE category_id IS NULL;

INSERT INTO content_blocks(block_key,title,body) VALUES
('faq','A little help, every step','Save favourites with the heart icon. Choose an available quantity on the product page, then continue to your bag. Sign in to place an order and follow its status in My Orders. Contact our team for help choosing your piece.'),
('shipping','Shipping & delivery','Your shipping charge is calculated at checkout from your order total. Please contact our team to confirm delivery availability and an estimated arrival date for your destination.'),
('returns','Returns & exchanges','For help with a return or exchange, contact our team with your order number and details of your request. Please confirm the applicable return conditions before purchasing.'),
('care','Care for your collection','Store each piece separately in a soft pouch. Avoid chemicals, perfume and prolonged moisture. Wipe gently with a soft cloth after wear. Ask our team for care guidance specific to your gemstone.'),
('privacy','Privacy information','We use the contact and delivery details you submit to manage your account, respond to enquiries and fulfil orders. Contact our team to ask about your stored information or request help with your account. Detailed store policies must be confirmed with our team before purchase.'),
('terms','Shopping with Crysmona','Prices are displayed in US dollars. Availability and totals are confirmed at checkout. Natural gemstones vary in colour and character. Please contact our team to confirm any delivery, return or product questions before ordering.') ON CONFLICT(block_key) DO NOTHING;
UPDATE content_blocks SET title=replace(title,chr(92)||'n',chr(10)) WHERE block_key IN ('hero-02','hero-03') AND title LIKE '%'||chr(92)||'n%';
