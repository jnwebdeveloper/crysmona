INSERT INTO categories(name,slug,type,image_url,sort_order) VALUES
('Natural Gemstones','natural-gemstones','gemstone','/assets/amethyst.jpg',1),
('Pendants','pendants','jewellery','/assets/pendant-purple.jpg',1),
('Rings','rings','jewellery','/assets/pendant-amethyst.jpg',2),
('Bracelets','bracelets','jewellery','/assets/pendant-green.jpg',3),
('Dangles','dangles','jewellery','/assets/jewellery-1.jpg',4),
('Studs','studs','jewellery','/assets/pendant-black.jpg',5)
ON CONFLICT(slug) DO NOTHING;

INSERT INTO products(category_id,name,slug,sku,description,note,stone,metal,image_url,price_cents,stock_qty,featured) VALUES
((SELECT id FROM categories WHERE slug='pendants'),'Amethyst Pendant','amethyst-pendant','CRY-AM-001','A serene natural amethyst set in polished sterling silver, designed as an everyday keepsake.','Calm · Clarity · Balance','Natural Amethyst','Sterling Silver','/assets/pendant-amethyst.jpg',349000,25,true),
((SELECT id FROM categories WHERE slug='pendants'),'Green Turquoise Pendant','green-turquoise-pendant','CRY-TQ-002','A vivid green turquoise pendant with organic matrix patterns, framed in handcrafted sterling silver.','Protection · Strength · Growth','Natural Turquoise','Sterling Silver','/assets/pendant-green.jpg',379000,18,true),
((SELECT id FROM categories WHERE slug='pendants'),'Black Onyx Pendant','black-onyx-pendant','CRY-ON-003','Deep black natural stone in a refined silver setting, made for understated everyday elegance.','Confidence · Focus · Stability','Natural Onyx','Sterling Silver','/assets/pendant-black.jpg',365000,16,true),
((SELECT id FROM categories WHERE slug='pendants'),'Purple Copper Turquoise Pendant','purple-copper-turquoise-pendant','CRY-PC-004','A rare blend of vibrant colour and natural artistry, handcrafted to make every moment extraordinary.','Individuality · Colour · Artistry','Purple Copper Turquoise','Sterling Silver','/assets/pendant-purple.jpg',399000,12,true)
ON CONFLICT(slug) DO NOTHING;
