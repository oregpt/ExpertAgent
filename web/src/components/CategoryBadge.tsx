import React from 'react';

export type DocumentCategory = 'knowledge' | 'code' | 'data';

interface CategoryBadgeProps {
  category: DocumentCategory;
  size?: 'sm' | 'md';
}

const CATEGORY_CONFIG: Record<DocumentCategory, { label: string; color: string; bgColor: string }> = {
  knowledge: {
    label: 'Knowledge',
    color: '#10b981', // green
    bgColor: 'rgba(16, 185, 129, 0.15)',
  },
  code: {
    label: 'Code',
    color: '#8b5cf6', // purple
    bgColor: 'rgba(139, 92, 246, 0.15)',
  },
  data: {
    label: 'Data',
    color: '#3b82f6', // blue
    bgColor: 'rgba(59, 130, 246, 0.15)',
  },
};

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({ category, size = 'sm' }) => {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.knowledge;

  const styles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: size === 'sm' ? '2px 8px' : '4px 10px',
    borderRadius: 9999,
    fontSize: size === 'sm' ? 11 : 12,
    fontWeight: 500,
    color: config.color,
    backgroundColor: config.bgColor,
    border: `1px solid ${config.color}33`,
    whiteSpace: 'nowrap',
  };

  return (
    <span style={styles}>
      <span
        style={{
          width: size === 'sm' ? 6 : 8,
          height: size === 'sm' ? 6 : 8,
          borderRadius: '50%',
          backgroundColor: config.color,
        }}
      />
      {config.label}
    </span>
  );
};

export default CategoryBadge;
