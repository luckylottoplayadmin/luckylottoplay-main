import React, { useState } from 'react';
import { uploadBanner } from '@/services/storage.service';
import { UploadCloud, Link as LinkIcon, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import imageCompression from 'browser-image-compression';

interface BannerImageUploadProps {
  value: string;
  onChange: (url: string) => void;
}

export default function BannerImageUpload({ value, onChange }: BannerImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [mode, setMode] = useState<'upload' | 'url'>('upload');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // Compress the image before uploading
      const options = {
        maxSizeMB: 0.5, // 500kb
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      };
      const compressedFile = await imageCompression(file, options);
      
      const publicUrl = await uploadBanner(compressedFile);

      onChange(publicUrl);
      toast.success('Image uploaded successfully');
    } catch (error: any) {
      console.error('Banner upload failed');
      toast.error(error.message || 'Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
        <button 
          type="button" 
          onClick={() => setMode('upload')}
          className={`btn btn-sm ${mode === 'upload' ? 'btn-primary' : 'btn-outline'}`}
          style={{ flex: 1, padding: '4px' }}
        >
          <UploadCloud size={14} style={{ marginRight: '4px' }} /> Upload
        </button>
        <button 
          type="button" 
          onClick={() => setMode('url')}
          className={`btn btn-sm ${mode === 'url' ? 'btn-primary' : 'btn-outline'}`}
          style={{ flex: 1, padding: '4px' }}
        >
          <LinkIcon size={14} style={{ marginRight: '4px' }} /> URL
        </button>
      </div>

      {mode === 'upload' ? (
        <div style={{ position: 'relative' }}>
          <input 
            type="file" 
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="form-input"
            disabled={isUploading}
            style={{ padding: '8px', cursor: 'pointer' }}
          />
          {isUploading && (
            <div style={{ position: 'absolute', right: '12px', top: '10px' }}>
              <Loader2 size={18} className="spin" color="var(--color-primary)" />
            </div>
          )}
        </div>
      ) : (
        <input 
          type="text" 
          className="form-input" 
          placeholder="https://..." 
          value={value} 
          onChange={(e) => onChange(e.target.value)} 
        />
      )}
    </div>
  );
}
