import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AgentTheme, applyTheme, defaultTheme } from './theme';
import { useAdminTheme } from './AdminThemeContext';
import { FolderTree, Folder } from './components/FolderTree';
import { DocumentList, Document, Tag } from './components/DocumentList';
import { TagManager } from './components/TagManager';
import { CategoryBadge, DocumentCategory } from './components/CategoryBadge';

export interface KnowledgeBaseManagerProps {
  apiBaseUrl: string;
  agentId?: string;
  theme?: Partial<AgentTheme>;
}

interface StorageStats {
  totalDocuments: number;
  totalSize: number;
  byCategory: Record<string, number>;
  folderCount: number;
  tagCount: number;
}

export const KnowledgeBaseManager: React.FC<KnowledgeBaseManagerProps> = ({
  apiBaseUrl,
  agentId,
  theme,
}) => {
  const { colors } = useAdminTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mergedTheme: AgentTheme = { ...defaultTheme, ...(theme || {}) };

  // State
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [storage, setStorage] = useState<StorageStats | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('knowledge');
  const [uploadFolderId, setUploadFolderId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modals
  const [showTagManager, setShowTagManager] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState<'create' | 'rename'>('create');
  const [folderModalParentId, setFolderModalParentId] = useState<number | null>(null);
  const [folderModalFolder, setFolderModalFolder] = useState<Folder | null>(null);
  const [folderName, setFolderName] = useState('');

  // Document actions
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveDoc, setMoveDoc] = useState<Document | null>(null);
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [tagsDoc, setTagsDoc] = useState<Document | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  useEffect(() => {
    if (containerRef.current) {
      applyTheme(containerRef.current, mergedTheme);
    }
  }, [mergedTheme]);

  // API helpers
  const apiUrl = (path: string) => `${apiBaseUrl}/api/admin/agents/${agentId}${path}`;

  // Load data
  const loadFolders = useCallback(async () => {
    if (!agentId) return;
    try {
      const res = await fetch(apiUrl('/folders'));
      if (!res.ok) throw new Error('Failed to load folders');
      const data = await res.json();
      setFolders(data.folders || []);
    } catch (e: any) {
      console.error(e);
    }
  }, [apiBaseUrl, agentId]);

  const loadTags = useCallback(async () => {
    if (!agentId) return;
    try {
      const res = await fetch(apiUrl('/tags'));
      if (!res.ok) throw new Error('Failed to load tags');
      const data = await res.json();
      setAllTags(data.tags || []);
    } catch (e: any) {
      console.error(e);
    }
  }, [apiBaseUrl, agentId]);

  const loadDocuments = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    setError(null);
    try {
      // Build query string manually to avoid new URL() issues with relative paths
      const params = new URLSearchParams();
      if (selectedFolderId !== null) {
        params.set('folderId', String(selectedFolderId));
      }
      if (categoryFilter !== 'all') {
        params.set('category', categoryFilter);
      }
      const queryString = params.toString();
      const url = apiUrl('/documents') + (queryString ? `?${queryString}` : '');
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load documents');
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (e: any) {
      console.error(e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, agentId, selectedFolderId, categoryFilter]);

  const loadStorage = useCallback(async () => {
    if (!agentId) return;
    try {
      const res = await fetch(apiUrl('/storage'));
      if (!res.ok) throw new Error('Failed to load storage');
      const data = await res.json();
      setStorage(data.storage);
    } catch (e: any) {
      console.error(e);
    }
  }, [apiBaseUrl, agentId]);

  useEffect(() => {
    loadFolders();
    loadTags();
    loadStorage();
  }, [loadFolders, loadTags, loadStorage]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Folder actions
  const handleCreateFolder = (parentId: number | null) => {
    setFolderModalMode('create');
    setFolderModalParentId(parentId);
    setFolderModalFolder(null);
    setFolderName('');
    setShowFolderModal(true);
  };

  const handleRenameFolder = (folder: Folder) => {
    setFolderModalMode('rename');
    setFolderModalFolder(folder);
    setFolderName(folder.name);
    setShowFolderModal(true);
  };

  const handleDeleteFolder = async (folder: Folder) => {
    if (!confirm(`Delete folder "${folder.name}"?`)) return;
    try {
      const res = await fetch(apiUrl(`/folders/${folder.id}`), { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        // Show the specific error message from the API
        throw new Error(data.message || data.error || 'Failed to delete folder');
      }
      await loadFolders();
      await loadDocuments();
      await loadStorage();
      if (selectedFolderId === folder.id) setSelectedFolderId(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleFolderModalSubmit = async () => {
    if (!folderName.trim()) return;
    try {
      if (folderModalMode === 'create') {
        const res = await fetch(apiUrl('/folders'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: folderName.trim(), parentId: folderModalParentId }),
        });
        if (!res.ok) throw new Error('Failed to create folder');
      } else if (folderModalFolder) {
        const res = await fetch(apiUrl(`/folders/${folderModalFolder.id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: folderName.trim() }),
        });
        if (!res.ok) throw new Error('Failed to rename folder');
      }
      setShowFolderModal(false);
      await loadFolders();
      await loadStorage();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Tag actions
  const handleCreateTag = async (name: string, color: string) => {
    const res = await fetch(apiUrl('/tags'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to create tag');
    }
    await loadTags();
    await loadStorage();
  };

  const handleUpdateTag = async (tagId: number, name: string, color: string) => {
    const res = await fetch(apiUrl(`/tags/${tagId}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to update tag');
    }
    await loadTags();
    await loadDocuments();
  };

  const handleDeleteTag = async (tagId: number) => {
    const res = await fetch(apiUrl(`/tags/${tagId}`), { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete tag');
    await loadTags();
    await loadDocuments();
    await loadStorage();
  };

  // Document actions
  const handleDeleteDocument = async (doc: Document) => {
    if (!confirm(`Delete "${doc.title}"?`)) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/kb/${doc.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete document');
      await loadDocuments();
      await loadStorage();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleMoveDocument = (doc: Document) => {
    setMoveDoc(doc);
    setShowMoveModal(true);
  };

  const handleMoveDocumentSubmit = async (folderId: number | null) => {
    if (!moveDoc) return;
    try {
      const res = await fetch(apiUrl(`/documents/${moveDoc.id}/move`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId }),
      });
      if (!res.ok) throw new Error('Failed to move document');
      setShowMoveModal(false);
      setMoveDoc(null);
      await loadDocuments();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleChangeCategory = async (doc: Document, category: DocumentCategory) => {
    try {
      const res = await fetch(apiUrl(`/documents/${doc.id}/category`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      });
      if (!res.ok) throw new Error('Failed to change category');
      await loadDocuments();
      await loadStorage();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleEditTags = (doc: Document) => {
    setTagsDoc(doc);
    setSelectedTagIds(doc.tags.map((t) => t.id));
    setShowTagsModal(true);
  };

  const handleSaveDocTags = async () => {
    if (!tagsDoc) return;
    try {
      const res = await fetch(apiUrl(`/documents/${tagsDoc.id}/tags`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds: selectedTagIds }),
      });
      if (!res.ok) throw new Error('Failed to update tags');
      setShowTagsModal(false);
      setTagsDoc(null);
      await loadDocuments();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Bulk operations
  const handleBulkCategoryAssign = async (docIds: number[], category: DocumentCategory) => {
    try {
      const res = await fetch(apiUrl('/documents/bulk-category'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds: docIds, category }),
      });
      if (!res.ok) throw new Error('Failed to apply category');
      await loadDocuments();
      await loadStorage();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleBulkDelete = async (docIds: number[]) => {
    try {
      const res = await fetch(apiUrl('/documents/bulk-delete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds: docIds }),
      });
      if (!res.ok) throw new Error('Failed to delete documents');
      await loadDocuments();
      await loadStorage();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Upload - batch upload multiple files
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadFiles.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      uploadFiles.forEach((file) => {
        formData.append('files', file);
      });
      if (agentId) formData.append('agentId', agentId);
      formData.append('category', uploadCategory);
      if (uploadFolderId !== null) formData.append('folderId', String(uploadFolderId));

      const res = await fetch(`${apiBaseUrl}/api/kb/files/batch`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Failed to upload files');
      const result = await res.json();

      setShowUploadModal(false);
      setUploadFiles([]);
      setUploadCategory('knowledge');
      setUploadFolderId(null);
      await loadDocuments();
      await loadStorage();

      // Show error if some files failed
      if (result.failed > 0) {
        setError(`Uploaded ${result.succeeded} files. ${result.failed} failed: ${result.errors.map((e: any) => e.filename).join(', ')}`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  // Handle file selection from input
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setUploadFiles((prev) => [...prev, ...files].slice(0, 20)); // Max 20 files
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setUploadFiles((prev) => [...prev, ...files].slice(0, 20)); // Max 20 files
    }
  };

  // Remove a file from the upload list
  const removeUploadFile = (index: number) => {
    setUploadFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Clear all files
  const clearUploadFiles = () => {
    setUploadFiles([]);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Flatten folders for select dropdown
  const flattenFolders = (folders: Folder[], level = 0): { folder: Folder; level: number }[] => {
    return folders.flatMap((f) => [
      { folder: f, level },
      ...flattenFolders(f.children || [], level + 1),
    ]);
  };
  const flatFolders = flattenFolders(folders);

  return (
    <div
      ref={containerRef}
      className="agentinabox-kb-root"
      style={{
        fontFamily: mergedTheme.fontFamily || 'inherit',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 500,
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: colors.text }}>Knowledge Base</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textSecondary }}>
              Organize and manage reference documents for your agent.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowTagManager(true)}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: `1px solid ${colors.border}`,
                background: colors.bgCard,
                color: colors.text,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                <line x1="7" y1="7" x2="7.01" y2="7"></line>
              </svg>
              Tags
            </button>
            <button
              onClick={() => {
                setUploadFolderId(selectedFolderId);
                setShowUploadModal(true);
              }}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                background: colors.primary,
                color: '#fff',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              Upload
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 14px',
            borderRadius: 8,
            backgroundColor: `${colors.error}15`,
            color: colors.error,
            fontSize: 13,
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{ float: 'right', background: 'none', border: 'none', color: colors.error, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: 16,
          minHeight: 0,
        }}
      >
        {/* Left: Folder Tree */}
        <div
          style={{
            width: 220,
            flexShrink: 0,
            backgroundColor: colors.bgCard,
            borderRadius: 12,
            border: `1px solid ${colors.border}`,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <FolderTree
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={setSelectedFolderId}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
          />
        </div>

        {/* Right: Document List */}
        <div
          style={{
            flex: 1,
            backgroundColor: colors.bgCard,
            borderRadius: 12,
            border: `1px solid ${colors.border}`,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
          }}
        >
          {/* Toolbar */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${colors.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            {/* Category Filter */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['all', 'knowledge', 'code', 'data'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: `1px solid ${categoryFilter === cat ? colors.primary : colors.border}`,
                    background: categoryFilter === cat ? `${colors.primary}15` : 'transparent',
                    color: categoryFilter === cat ? colors.primary : colors.textSecondary,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            <button
              onClick={loadDocuments}
              disabled={loading}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: `1px solid ${colors.border}`,
                background: colors.bgSecondary,
                color: colors.textSecondary,
                fontSize: 12,
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {/* Document Table */}
          <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
            <DocumentList
              documents={documents}
              allTags={allTags}
              onDeleteDocument={handleDeleteDocument}
              onMoveDocument={handleMoveDocument}
              onChangeCategory={handleChangeCategory}
              onEditTags={handleEditTags}
              onBulkCategoryAssign={handleBulkCategoryAssign}
              onBulkDelete={handleBulkDelete}
            />
          </div>
        </div>
      </div>

      {/* Footer: Storage Stats */}
      {storage && (
        <div
          style={{
            marginTop: 16,
            padding: '12px 16px',
            backgroundColor: colors.bgCard,
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            fontSize: 12,
            color: colors.textSecondary,
          }}
        >
          <span>
            <strong style={{ color: colors.text }}>{storage.totalDocuments}</strong> documents
          </span>
          <span>
            <strong style={{ color: colors.text }}>{formatSize(storage.totalSize)}</strong> total
          </span>
          <span>
            <strong style={{ color: colors.text }}>{storage.folderCount}</strong> folders
          </span>
          <span>
            <strong style={{ color: colors.text }}>{storage.tagCount}</strong> tags
          </span>
        </div>
      )}

      {/* Tag Manager Modal */}
      <TagManager
        isOpen={showTagManager}
        onClose={() => setShowTagManager(false)}
        tags={allTags}
        onCreateTag={handleCreateTag}
        onUpdateTag={handleUpdateTag}
        onDeleteTag={handleDeleteTag}
      />

      {/* Folder Create/Rename Modal */}
      {showFolderModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowFolderModal(false)}
        >
          <div
            style={{
              backgroundColor: colors.bgCard,
              borderRadius: 12,
              padding: 24,
              width: 320,
              boxShadow: colors.shadowLg,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: colors.text }}>
              {folderModalMode === 'create' ? 'New Folder' : 'Rename Folder'}
            </h3>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Folder name"
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bgInput,
                color: colors.text,
                fontSize: 14,
                marginBottom: 16,
                boxSizing: 'border-box',
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleFolderModalSubmit()}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setShowFolderModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: `1px solid ${colors.border}`,
                  background: colors.bgSecondary,
                  color: colors.text,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleFolderModalSubmit}
                disabled={!folderName.trim()}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: colors.primary,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: folderName.trim() ? 'pointer' : 'not-allowed',
                  opacity: folderName.trim() ? 1 : 0.5,
                }}
              >
                {folderModalMode === 'create' ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowUploadModal(false)}
        >
          <form
            onSubmit={handleUpload}
            style={{
              backgroundColor: colors.bgCard,
              borderRadius: 12,
              padding: 24,
              width: 480,
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: colors.shadowLg,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: colors.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                Upload Files
              </h3>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: colors.textSecondary,
                  cursor: 'pointer',
                  fontSize: 18,
                  padding: 4,
                }}
              >
                ×
              </button>
            </div>

            {/* File Type Info */}
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  backgroundColor: colors.bgSecondary,
                  borderRadius: 6,
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500, color: colors.text }}>Knowledge</span>
                <span style={{ fontSize: 11, color: colors.textSecondary }}>(.pdf, .doc, .docx, .txt, .md)</span>
              </div>
              <span style={{ fontSize: 11, color: colors.textSecondary }}>
                Documents for AI knowledge base (PDFs, docs, text)
              </span>
            </div>

            {/* Drag & Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragging ? colors.primary : colors.border}`,
                borderRadius: 8,
                padding: '32px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                backgroundColor: isDragging ? `${colors.primary}08` : 'transparent',
                transition: 'all 0.2s ease',
                marginBottom: 16,
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke={isDragging ? colors.primary : colors.textSecondary}
                strokeWidth="1.5"
                style={{ marginBottom: 8 }}
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <div style={{ fontSize: 13, color: colors.text, marginBottom: 4 }}>
                Drag & drop files here, or click to select
              </div>
              <div style={{ fontSize: 11, color: colors.textSecondary }}>
                Accepted: pdf, .doc, .docx, .txt, .md (max 20 files)
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.md"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>

            {/* Selected Files List */}
            {uploadFiles.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 500, color: colors.text }}>
                    Selected Files ({uploadFiles.length})
                  </span>
                  <button
                    type="button"
                    onClick={clearUploadFiles}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: colors.textSecondary,
                      fontSize: 12,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Clear All
                  </button>
                </div>
                <div
                  style={{
                    maxHeight: 180,
                    overflowY: 'auto',
                    border: `1px solid ${colors.border}`,
                    borderRadius: 6,
                  }}
                >
                  {uploadFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderBottom: index < uploadFiles.length - 1 ? `1px solid ${colors.border}` : 'none',
                        backgroundColor: colors.bgCard,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                        <span
                          style={{
                            fontSize: 13,
                            color: colors.text,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {file.name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, color: colors.textSecondary }}>
                          {formatSize(file.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeUploadFile(index)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: colors.textSecondary,
                            cursor: 'pointer',
                            padding: 2,
                            fontSize: 16,
                            lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Category */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: colors.textSecondary }}>
                Category (applied to all files)
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['knowledge', 'code', 'data'] as DocumentCategory[]).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setUploadCategory(cat)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: `1px solid ${uploadCategory === cat ? colors.primary : colors.border}`,
                      background: uploadCategory === cat ? `${colors.primary}15` : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <CategoryBadge category={cat} />
                  </button>
                ))}
              </div>
            </div>

            {/* Folder */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: colors.textSecondary }}>
                Folder (applied to all files)
              </label>
              <select
                value={uploadFolderId ?? ''}
                onChange={(e) => setUploadFolderId(e.target.value ? parseInt(e.target.value) : null)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: `1px solid ${colors.border}`,
                  backgroundColor: colors.bgInput,
                  color: colors.text,
                  fontSize: 13,
                }}
              >
                <option value="">Root (no folder)</option>
                {flatFolders.map(({ folder, level }) => (
                  <option key={folder.id} value={folder.id}>
                    {'  '.repeat(level)}
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                style={{
                  padding: '10px 20px',
                  borderRadius: 6,
                  border: `1px solid ${colors.border}`,
                  background: colors.bgSecondary,
                  color: colors.text,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading || uploadFiles.length === 0}
                style={{
                  padding: '10px 20px',
                  borderRadius: 6,
                  border: 'none',
                  background: colors.primary,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: uploading || uploadFiles.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: uploading || uploadFiles.length === 0 ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                {uploading ? 'Uploading...' : `Upload ${uploadFiles.length} File${uploadFiles.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Move Document Modal */}
      {showMoveModal && moveDoc && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowMoveModal(false)}
        >
          <div
            style={{
              backgroundColor: colors.bgCard,
              borderRadius: 12,
              padding: 24,
              width: 320,
              boxShadow: colors.shadowLg,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: colors.text }}>Move Document</h3>
            <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>
              Move "{moveDoc.title}" to:
            </p>
            <select
              defaultValue={moveDoc.folderId ?? ''}
              onChange={(e) => handleMoveDocumentSubmit(e.target.value ? parseInt(e.target.value) : null)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bgInput,
                color: colors.text,
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              <option value="">Root (no folder)</option>
              {flatFolders.map(({ folder, level }) => (
                <option key={folder.id} value={folder.id}>
                  {'  '.repeat(level)}
                  {folder.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowMoveModal(false)}
              style={{
                width: '100%',
                padding: '8px 16px',
                borderRadius: 6,
                border: `1px solid ${colors.border}`,
                background: colors.bgSecondary,
                color: colors.text,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Edit Tags Modal */}
      {showTagsModal && tagsDoc && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowTagsModal(false)}
        >
          <div
            style={{
              backgroundColor: colors.bgCard,
              borderRadius: 12,
              padding: 24,
              width: 320,
              boxShadow: colors.shadowLg,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: colors.text }}>Edit Tags</h3>
            <p style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>
              Select tags for "{tagsDoc.title}":
            </p>
            {allTags.length === 0 ? (
              <p style={{ fontSize: 13, color: colors.textSecondary, fontStyle: 'italic' }}>
                No tags created yet. Create tags first.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {allTags.map((tag) => (
                  <label
                    key={tag.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 6,
                      backgroundColor: selectedTagIds.includes(tag.id) ? `${tag.color}15` : colors.bgSecondary,
                      border: `1px solid ${selectedTagIds.includes(tag.id) ? tag.color : colors.border}`,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTagIds.includes(tag.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTagIds([...selectedTagIds, tag.id]);
                        } else {
                          setSelectedTagIds(selectedTagIds.filter((id) => id !== tag.id));
                        }
                      }}
                    />
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: tag.color,
                      }}
                    />
                    <span style={{ fontSize: 13, color: colors.text }}>{tag.name}</span>
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setShowTagsModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: `1px solid ${colors.border}`,
                  background: colors.bgSecondary,
                  color: colors.text,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDocTags}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: colors.primary,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeBaseManager;
