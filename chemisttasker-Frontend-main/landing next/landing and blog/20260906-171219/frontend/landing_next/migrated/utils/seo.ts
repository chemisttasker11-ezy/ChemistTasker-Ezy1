export const setRobotsMeta = (content?: string) => {
  const selector = 'meta[name="robots"]';
  const existing = document.head.querySelector(selector);

  if (!content) {
    if (existing) {
      existing.remove();
    }
    return;
  }

  const meta = existing ?? document.createElement('meta');
  meta.setAttribute('name', 'robots');
  meta.setAttribute('content', content);
  if (!existing) {
    document.head.appendChild(meta);
  }
};

export const setPageMeta = (title?: string, description?: string) => {
  if (typeof title === 'string') {
    document.title = title;
  }

  if (description === undefined) {
    return;
  }

  const selector = 'meta[name="description"]';
  const existing = document.head.querySelector(selector);
  if (!description) {
    if (existing) {
      existing.remove();
    }
    return;
  }

  const meta = existing ?? document.createElement('meta');
  meta.setAttribute('name', 'description');
  meta.setAttribute('content', description);
  if (!existing) {
    document.head.appendChild(meta);
  }
};

const setMetaTag = (key: string, value?: string, attribute: 'name' | 'property' = 'name') => {
  const selector = `meta[${attribute}="${key}"]`;
  const existing = document.head.querySelector(selector);

  if (!value) {
    if (existing) {
      existing.remove();
    }
    return;
  }

  const meta = existing ?? document.createElement('meta');
  meta.setAttribute(attribute, key);
  meta.setAttribute('content', value);
  if (!existing) {
    document.head.appendChild(meta);
  }
};

export const setCanonical = (url?: string) => {
  const selector = 'link[rel="canonical"]';
  const existing = document.head.querySelector(selector);

  if (!url) {
    if (existing) {
      existing.remove();
    }
    return;
  }

  const link = existing ?? document.createElement('link');
  link.setAttribute('rel', 'canonical');
  link.setAttribute('href', url);
  if (!existing) {
    document.head.appendChild(link);
  }
};

type SocialMeta = {
  title?: string;
  description?: string;
  url?: string;
  image?: string;
  type?: string;
};

export const setSocialMeta = ({ title, description, url, image, type }: SocialMeta) => {
  setMetaTag('og:title', title, 'property');
  setMetaTag('og:description', description, 'property');
  setMetaTag('og:url', url, 'property');
  setMetaTag('og:image', image, 'property');
  setMetaTag('og:type', type ?? 'website', 'property');

  setMetaTag('twitter:card', image ? 'summary_large_image' : 'summary');
  setMetaTag('twitter:title', title);
  setMetaTag('twitter:description', description);
  setMetaTag('twitter:image', image);
};

export const setJsonLd = (id: string, data?: Record<string, unknown>) => {
  const selector = `script[type="application/ld+json"][data-seo-id="${id}"]`;
  const existing = document.head.querySelector(selector);

  if (!data) {
    if (existing) {
      existing.remove();
    }
    return;
  }

  const script = (existing as HTMLScriptElement | null) ?? document.createElement('script');
  script.type = 'application/ld+json';
  script.setAttribute('data-seo-id', id);
  script.text = JSON.stringify(data);
  if (!existing) {
    document.head.appendChild(script);
  }
};
