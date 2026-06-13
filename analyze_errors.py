#!/usr/bin/env python3
"""Analyze article JSON files for error patterns."""
import json, os, re
from html.parser import HTMLParser
from collections import Counter

DATA_DIR = "/home/z19/AI_thinksmart/ToolAI/AutoContentPoster/data"
EXCLUDE = {"wp-config.json", "api-usage.json", "templates.json", "category-cache.json", 
           "users.json", "queue.json", "library.json", "notes.json"}

class HTMLTagCounter(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = Counter()
        self.text_length = 0
        self.img_count = 0
        self.h2_count = 0
        self.h3_count = 0
        self.h4_count = 0
        self.has_table = False
        self.has_blockquote = False
        self.has_figure = False
        self.has_callout = False
        self.has_div = False
        self.has_li = False
        self.has_strong = False
        self.has_em = False
        self.has_ul = False
        self.has_ol = False
        self.in_text = False
        
    def handle_starttag(self, tag, attrs):
        self.tags[tag] += 1
        if tag == 'img': self.img_count += 1
        if tag == 'h2': self.h2_count += 1
        if tag == 'h3': self.h3_count += 1
        if tag == 'h4': self.h4_count += 1
        if tag == 'table': self.has_table = True
        if tag == 'blockquote': self.has_blockquote = True
        if tag == 'figure': self.has_figure = True
        if tag == 'div': self.has_div = True
        if tag == 'li': self.has_li = True
        if tag in ('strong', 'b'): self.has_strong = True
        if tag in ('em', 'i'): self.has_em = True
        if tag == 'ul': self.has_ul = True
        if tag == 'ol': self.has_ol = True
        
    def handle_data(self, data):
        self.text_length += len(data.strip())

def analyze_article(content_html):
    parser = HTMLTagCounter()
    parser.feed(content_html)
    return parser

def extract_first_para(text):
    """Extract first paragraph text from HTML."""
    match = re.search(r'<p>(.*?)</p>', text)
    if match:
        return match.group(1)[:150]
    return ""

print("=" * 80)
print("ERROR PATTERN ANALYSIS: Article Samples in data/")
print("=" * 80)

articles = []
files_analyzed = 0

for fname in sorted(os.listdir(DATA_DIR)):
    fpath = os.path.join(DATA_DIR, fname)
    if not os.path.isfile(fpath) or not fname.endswith('.json'):
        continue
    if fname in EXCLUDE:
        continue
    
    files_analyzed += 1
    with open(fpath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    title = data.get('title', 'N/A')
    content = data.get('content', '')
    summary = data.get('summary', '')
    thumbnail = data.get('thumbnail', '')
    keywords = data.get('keywords', [])
    alt_images = data.get('altImages', [])
    images = data.get('images', [])
    wpId = data.get('wpId', 'N/A')
    published = data.get('published', False)
    publishedAt = data.get('publishedAt', '')
    createdAt = data.get('createdAt', '')
    
    # Analyze HTML structure
    analyzer = analyze_article(content)
    first_para = extract_first_para(content)
    
    article_info = {
        'filename': fname,
        'title': title,
        'content_len': len(content),
        'text_len': analyzer.text_length,
        'tags': dict(analyzer.tags),
        'html_tags_count': sum(analyzer.tags.values()),
        'img_count': analyzer.img_count,
        'h2_count': analyzer.h2_count,
        'h3_count': analyzer.h3_count,
        'has_table': analyzer.has_table,
        'has_blockquote': analyzer.has_blockquote,
        'has_figure': analyzer.has_figure,
        'has_div': analyzer.has_div,
        'has_callout': analyzer.has_callout,
        'has_li': analyzer.has_li,
        'has_strong': analyzer.has_strong,
        'has_ul': analyzer.has_ul,
        'has_ol': analyzer.has_ol,
        'thumbnail': 'YES' if thumbnail else 'EMPTY',
        'keywords_count': len(keywords),
        'images_in_field': len(images),
        'alt_images_count': len(alt_images),
        'published': published,
        'wpId': wpId,
        'first_para_preview': first_para[:100],
        'summary': summary[:120] if summary else 'EMPTY',
    }
    articles.append(article_info)

# Print each article analysis
print(f"\nTotal files analyzed: {files_analyzed}")
print(f"Total articles: {len(articles)}\n")

for i, a in enumerate(articles, 1):
    print(f"\n{'─'*70}")
    print(f"  ARTICLE #{i}: {a['filename']}")
    print(f"{'─'*70}")
    print(f"  Title: {a['title']}")
    print(f"  Content Length: {a['content_len']} chars | Text Length: {a['text_len']} chars")
    print(f"  HTML Tags Used ({a['html_tags_count']} total): {dict(sorted(a['tags'].items()))}")
    print(f"  Headings: h2={a['h2_count']}, h3={a['h3_count']}")
    print(f"  Images: {a['img_count']} (images field: {a['images_in_field']}, altImages: {a['alt_images_count']})")
    print(f"  Tables: {a['has_table']} | Blockquote: {a['has_blockquote']} | Figure: {a['has_figure']} | Div: {a['has_div']}")
    print(f"  Lists: ul={a['has_ul']}, ol={a['has_ol']}, li={a['has_li']}")
    print(f"  Bold: {a['has_strong']} | Italic: {a['has_em']}")
    print(f"  Thumbnail: {a['thumbnail']} | Published: {a['published']} | wpId: {a['wpId']}")
    print(f"  Keywords: {a['keywords_count']}")
    print(f"  First Para: {a['first_para_preview'][:80]}...")
    print(f"  Summary: {a['summary']}")

# SUMMARY OF ERROR PATTERNS
print("\n\n")
print("=" * 80)
print("PATTERN LỖI TỔNG HỢP")
print("=" * 80)

# 1. Empty content
empty_content = [a for a in articles if a['text_len'] == 0]
print(f"\n❌ 1. EMPTY CONTENT (text_len=0): {len(empty_content)} articles")
for a in empty_content:
    print(f"     - {a['filename']} : title='{a['title']}', published={a['published']}")
    if a['published']:
        print(f"       ⚠️  LỖI NGHIÊM TRỌNG: Bài đã publish nhưng content rỗng!")

# 2. Missing images
no_images = [a for a in articles if a['img_count'] == 0 and a['text_len'] > 0]
print(f"\n❌ 2. NO IMAGES (content >0 but img=0): {len(no_images)} articles")
for a in no_images:
    print(f"     - {a['filename']} : title='{a['title']}'")

# 3. Image path issues
print("\n❌ 3. IMAGE PATH ANALYSIS:")
img_paths = set()
for a in articles:
    if a['images_in_field'] > 0:
        fpath = os.path.join(DATA_DIR, a['filename'])
        with open(fpath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        for img in data.get('images', []):
            img_paths.add(img)
            print(f"     - {a['filename']}: image path = '{img}'")

# 4. Summary quality
generic_summaries = [a for a in articles if 'Bài viết chuyên sâu' in a.get('summary', '')]
print(f"\n❌ 4. GENERIC/PLACEHOLDER SUMMARY 'Bài viết chuyên sâu về...': {len(generic_summaries)} articles")
for a in generic_summaries:
    print(f"     - {a['filename']} : '{a['summary']}'")

# 5. Keyword issues
no_keywords = [a for a in articles if a['keywords_count'] == 0 and a['text_len'] > 0]
print(f"\n❌ 5. MISSING KEYWORDS: {len(no_keywords)} articles")
for a in no_keywords:
    print(f"     - {a['filename']} : title='{a['title']}'")

# 6. Heading structure issues
print(f"\n❌ 6. HEADING STRUCTURE:")
for a in articles:
    if a['text_len'] > 0:
        has_h2 = a['h2_count'] > 0
        has_h3 = a['h3_count'] > 0
        if not has_h2:
            print(f"     - {a['filename']}: ⚠️ KHÔNG có h2 tag")

# 7. Content diversity - opening hook patterns
print(f"\n❌ 7. OPENING HOOK PATTERNS (first words):")
for a in articles:
    if a['text_len'] > 0:
        fp = a['first_para_preview'][:60]
        print(f"     - {a['filename'][:35]}: '{fp}'")

# 8. HTML tag diversity
print(f"\n❌ 8. HTML TAG STRUCTURE COMPARISON:")
for a in articles:
    if a['text_len'] > 0:
        tags_present = [t for t, c in sorted(a['tags'].items()) if c > 0]
        missing_rich = []
        if not a['has_strong']: missing_rich.append('bold')
        if not a['has_em']: missing_rich.append('italic')
        if not a['has_ul'] and not a['has_ol']: missing_rich.append('lists')
        if not a['has_figure']: missing_rich.append('figure')
        print(f"     - {a['filename'][:35]}: tags=[{','.join(tags_present)}] | missing: {missing_rich}")

# 9. thumbnails
print(f"\n❌ 9. THUMBNAIL STATUS:")
for a in articles:
    fpath = os.path.join(DATA_DIR, a['filename'])
    with open(fpath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    thumb = data.get('thumbnail', '')
    if thumb:
        print(f"     - {a['filename'][:40]}: thumbnail='{thumb}' (exists={os.path.exists(os.path.join(DATA_DIR, '..', 'uploads', os.path.basename(thumb))) if thumb else 'N/A'})")
    else:
        print(f"     - {a['filename'][:40]}: thumbnail='' (EMPTY)")

# 10. Summary analysis
print(f"\n❌ 10. SUMMARY QUALITY CHECK:")
for a in articles:
    fpath = os.path.join(DATA_DIR, a['filename'])
    with open(fpath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    summ = data.get('summary', '')
    if summ and 'Bài viết chuyên sâu' not in summ:
        # Check if summary is just a rephrase of title
        title = data.get('title', '')
        overlap = len(set(summ.lower().split()) & set(title.lower().split()))
        total_unique = len(set(summ.lower().split()) | set(title.lower().split()))
        overlap_pct = (overlap / total_unique * 100) if total_unique > 0 else 0
        print(f"     - {a['filename'][:35]}: overlap_with_title={overlap_pct:.0f}% | len={len(summ)} chars")
        if overlap_pct > 50:
            print(f"       ⚠️  Summary gần như lặp lại title!")

# 11. Category consistency
print(f"\n❌ 11. CATEGORY:")
cats = Counter()
for a in articles:
    fpath = os.path.join(DATA_DIR, a['filename'])
    with open(fpath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    cats[data.get('category_slug', 'N/A')] += 1
print(f"     Categories: {dict(cats)}")
if len(cats) == 1:
    print(f"     ⚠️  Tất cả bài đều cùng 1 category: '{list(cats.keys())[0]}'")

print("\n" + "=" * 80)
print("KẾT LUẬN")
print("=" * 80)
