import React from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import type { JsonValue } from '@chemisttasker/shared-core';
import { colors, font, radius, space } from '@/constants/tokens';
import { safePublicUrl } from './webLinks';

type RichNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: RichNode[];
};

function content(node: RichNode): RichNode[] {
  return Array.isArray(node.content) ? node.content : [];
}

export function RichContent({ document, fallback = '' }: { document: JsonValue | null; fallback?: string }) {
  const root = document && typeof document === 'object' && !Array.isArray(document)
    ? document as unknown as RichNode : null;

  const render = (node: RichNode, key: string): React.ReactNode => {
    if (node.type === 'text') {
      const marks = Array.isArray(node.marks) ? node.marks : [];
      const href = marks.find(mark => mark.type === 'link')?.attrs?.href;
      const link = safePublicUrl(href);
      return <Text key={key}
        style={[styles.inline, marks.some(m => m.type === 'bold') && styles.bold,
          marks.some(m => m.type === 'italic') && styles.italic,
          marks.some(m => m.type === 'strike') && styles.strike,
          marks.some(m => m.type === 'code') && styles.code,
          link && styles.link]}
        accessibilityRole={link ? 'link' : undefined}
        onPress={link ? () => { void Linking.openURL(link).catch(() => {}); } : undefined}
      >{String(node.text || '')}</Text>;
    }
    const children = content(node).map((child, index) => render(child, key + '-' + index));
    switch (node.type) {
      case 'doc': return <View key={key} style={styles.document}>{children}</View>;
      case 'paragraph': return <Text key={key} style={styles.paragraph}>{children}</Text>;
      case 'heading': return <Text key={key} accessibilityRole="header"
        style={[styles.heading, node.attrs?.level === 3 && styles.heading3, node.attrs?.level === 4 && styles.heading4]}>
        {children}
      </Text>;
      case 'bulletList':
      case 'orderedList': return <View key={key} style={styles.list}>{content(node).map((child, index) =>
        <View key={key + '-' + index} style={styles.listRow}>
          <Text style={styles.bullet}>{node.type === 'orderedList' ? String(index + 1) + '.' : '•'}</Text>
          <View style={styles.listBody}>{content(child).map((item, childIndex) => render(item, key + '-item-' + index + '-' + childIndex))}</View>
        </View>)}</View>;
      case 'listItem': return <View key={key}>{children}</View>;
      case 'blockquote': return <View key={key} style={styles.quote}>{children}</View>;
      case 'hardBreak': return <Text key={key}>{'\n'}</Text>;
      case 'image': {
        const uri = safePublicUrl(node.attrs?.src, true);
        return uri ? <Image key={key} source={{ uri }} resizeMode="contain" accessible
          accessibilityLabel={typeof node.attrs?.alt === 'string' ? node.attrs.alt : 'Article image'}
          style={styles.image} /> : null;
      }
      default: return null;
    }
  };
  if (root?.type === 'doc') return <>{render(root, 'root')}</>;
  return <View style={styles.document}>
    {fallback.split(/\r?\n\s*\r?\n/).filter(Boolean).map((line, index) =>
      <Text key={index} style={line.startsWith('## ') ? styles.heading : styles.paragraph}>
        {line.startsWith('## ') ? line.slice(3) : line}
      </Text>)}
  </View>;
}

const styles = StyleSheet.create({
  document: { gap: space.md },
  paragraph: { color: colors.textPrimary, fontFamily: font.inter.regular, fontSize: 16, lineHeight: 26 },
  inline: { color: colors.textPrimary },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  code: { backgroundColor: colors.primarySoft, fontFamily: 'monospace' },
  link: { color: colors.primary, textDecorationLine: 'underline' },
  heading: { color: colors.textPrimary, fontSize: 23, lineHeight: 30, fontWeight: '700' },
  heading3: { fontSize: 20, lineHeight: 27 },
  heading4: { fontSize: 18, lineHeight: 24 },
  list: { gap: space.sm },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  bullet: { color: colors.primary, fontSize: 16, minWidth: 22 },
  listBody: { flex: 1 },
  quote: { padding: space.lg, borderLeftWidth: 3, borderLeftColor: colors.primary, backgroundColor: colors.primarySoft, borderRadius: radius.control },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.card, backgroundColor: colors.primarySoft },
});
