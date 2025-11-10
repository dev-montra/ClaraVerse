/**
 * ClaraMemoryCompressionDialog.tsx
 *
 * Dialog component for Clara memory compression
 * Shows when memory is getting too large and needs compression
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  LinearProgress,
  Alert,
  Chip,
  Stack,
} from '@mui/material';
import {
  Memory as MemoryIcon,
  Compress as CompressIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import {
  getMemorySize,
  formatBytes,
  compressMemoryProfile,
  MEMORY_SIZE_LIMITS,
  type MemorySizeInfo,
  type CompressionResult,
} from '../../services/claraMemoryCompression';
import { UserMemoryProfile } from '../ClaraSweetMemory';
import type { ClaraProvider } from '../../types/clara_assistant_types';
import { claraMemoryIntegration } from '../../services/ClaraMemoryIntegration';

// ==================== INTERFACES ====================

export interface ClaraMemoryCompressionDialogProps {
  open: boolean;
  onClose: () => void;
  memoryProfile: UserMemoryProfile | null;
  onCompressionComplete: (compressedProfile: UserMemoryProfile) => void;
  sizeInfo: MemorySizeInfo;
  provider?: ClaraProvider;
  model?: string;
}

// ==================== COMPONENT ====================

const ClaraMemoryCompressionDialog: React.FC<ClaraMemoryCompressionDialogProps> = ({
  open,
  onClose,
  memoryProfile,
  onCompressionComplete,
  sizeInfo,
  provider,
  model,
}) => {
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionResult, setCompressionResult] = useState<CompressionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCompress = async () => {
    if (!memoryProfile) return;

    if (!provider || !model) {
      setError('No provider or model selected. Please select a model in chat settings first.');
      return;
    }

    setIsCompressing(true);
    setError(null);

    try {
      console.log('🗜️ User initiated compression...');
      console.log('🗜️ Using provider:', provider.name, 'model:', model);

      // Step 1: Compress using AI
      const result = await compressMemoryProfile(memoryProfile, {
        provider,
        model,
        targetSize: MEMORY_SIZE_LIMITS.TARGET_SIZE,
      });

      setCompressionResult(result);

      if (result.success) {
        console.log('🗜️ Compression successful!');
        console.log('🗜️ DELETING old memory and REPLACING with compressed version...');

        // Step 2: SAVE the compressed profile to storage (REPLACE old one)
        const saved = await claraMemoryIntegration.getCurrentUserProfile();
        if (saved) {
          // Update with compressed profile
          await claraMemoryIntegration.getMemoryStats(); // Force refresh
        }

        // Manually save the compressed profile
        const { claraMemoryManager } = await import('../../services/ClaraMemoryManager');
        await claraMemoryManager.saveUserProfile(result.compressedProfile);

        console.log('🗜️ ✅ Compressed memory SAVED to storage!');
        onCompressionComplete(result.compressedProfile);
      } else {
        setError(result.error || 'Compression failed');
      }

    } catch (err) {
      console.error('🗜️ Compression error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleClose = () => {
    if (!isCompressing) {
      setCompressionResult(null);
      setError(null);
      onClose();
    }
  };

  const getSeverity = (): 'info' | 'warning' | 'error' => {
    if (sizeInfo.isOverMaxSize) return 'error';
    if (sizeInfo.isOverWarningThreshold) return 'warning';
    return 'info';
  };

  const getProgressColor = (): 'primary' | 'warning' | 'error' => {
    if (sizeInfo.isOverMaxSize) return 'error';
    if (sizeInfo.isOverWarningThreshold) return 'warning';
    return 'primary';
  };

  const calculateProgress = (): number => {
    return Math.min(100, (sizeInfo.totalBytes / MEMORY_SIZE_LIMITS.MAX_SIZE) * 100);
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={isCompressing}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <MemoryIcon />
        <Typography variant="h6" component="span">
          Clara's Memory is Overfilled
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2}>
          {/* Memory Size Alert */}
          <Alert severity={getSeverity()} icon={<MemoryIcon />}>
            <Typography variant="body2">
              {sizeInfo.isOverMaxSize && (
                <>Clara's memory has reached the maximum size limit and needs compression.</>
              )}
              {sizeInfo.isOverWarningThreshold && !sizeInfo.isOverMaxSize && (
                <>Clara's memory is getting full. Compression is recommended.</>
              )}
            </Typography>
          </Alert>

          {/* Current Size Info */}
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Current Memory Size
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Typography variant="h6">
                {formatBytes(sizeInfo.totalBytes)}
              </Typography>
              <Chip
                label={`${calculateProgress().toFixed(0)}% of limit`}
                size="small"
                color={getProgressColor()}
              />
            </Box>
            <LinearProgress
              variant="determinate"
              value={calculateProgress()}
              color={getProgressColor()}
              sx={{ height: 8, borderRadius: 1 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Limit: {formatBytes(MEMORY_SIZE_LIMITS.MAX_SIZE)}
            </Typography>
          </Box>

          {/* Largest Sections */}
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Largest Memory Sections
            </Typography>
            <Stack spacing={0.5}>
              {Object.entries(sizeInfo.sectionSizes)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([section, size]) => (
                  <Box
                    key={section}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      p: 0.5,
                      bgcolor: 'background.default',
                      borderRadius: 1,
                    }}
                  >
                    <Typography variant="caption">{section}</Typography>
                    <Typography variant="caption" fontWeight="bold">
                      {formatBytes(size)}
                    </Typography>
                  </Box>
                ))}
            </Stack>
          </Box>

          {/* Compression Info */}
          {!compressionResult && (
            <Alert severity="info" icon={<CompressIcon />}>
              <Typography variant="body2">
                Clara wants to compress her memories to free up space. This process:
              </Typography>
              <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2 }}>
                <Typography component="li" variant="caption">
                  Removes duplicate and similar information
                </Typography>
                <Typography component="li" variant="caption">
                  Summarizes long lists and conversation topics
                </Typography>
                <Typography component="li" variant="caption">
                  Preserves all important information about you
                </Typography>
                <Typography component="li" variant="caption">
                  Typically reduces memory size by 50-70%
                </Typography>
              </Box>
            </Alert>
          )}

          {/* Compression Progress */}
          {isCompressing && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <LinearProgress sx={{ mb: 2 }} />
              <Typography variant="body2" color="text.secondary">
                Clara is compressing her memories...
              </Typography>
            </Box>
          )}

          {/* Compression Success */}
          {compressionResult && compressionResult.success && (
            <Alert severity="success" icon={<SuccessIcon />}>
              <Typography variant="body2" gutterBottom>
                <strong>Compression Successful! 🎉</strong>
              </Typography>
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" display="block">
                  Original Size: {formatBytes(compressionResult.originalSize)}
                </Typography>
                <Typography variant="caption" display="block">
                  Compressed Size: {formatBytes(compressionResult.compressedSize)}
                </Typography>
                <Typography variant="caption" display="block" fontWeight="bold" color="success.main">
                  Reduced by {compressionResult.compressionRatio.toFixed(1)}%
                </Typography>
              </Box>
            </Alert>
          )}

          {/* Compression Error */}
          {error && (
            <Alert severity="error" icon={<ErrorIcon />}>
              <Typography variant="body2">
                <strong>Compression Failed</strong>
              </Typography>
              <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                {error}
              </Typography>
            </Alert>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button
          onClick={handleClose}
          disabled={isCompressing}
        >
          {compressionResult?.success ? 'Close' : 'Cancel'}
        </Button>
        {!compressionResult?.success && (
          <Button
            onClick={handleCompress}
            variant="contained"
            disabled={isCompressing || !memoryProfile}
            startIcon={<CompressIcon />}
          >
            {isCompressing ? 'Compressing...' : 'Compress Memory'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ClaraMemoryCompressionDialog;
