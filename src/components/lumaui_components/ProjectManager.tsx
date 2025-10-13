import React, { useState, useEffect } from 'react';
import { Plus, FolderOpen, Trash2, Play, Search, Grid3X3, List, Edit } from 'lucide-react';
import { Project } from '../../types';
import { db } from '../../db';
import { getDefaultWallpaper } from '../../utils/uiPreferences';

interface ProjectManagerProps {
  projects: Project[];
  onSelectProject: (project: Project, viewMode: 'play' | 'edit') => void;
  onDeleteProject: (project: Project) => Promise<void>;
  onCreateNew: () => void;
}

const ProjectManager: React.FC<ProjectManagerProps> = ({
  projects,
  onSelectProject,
  onDeleteProject,
  onCreateNew
}) => {
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  // Load wallpaper from database
  useEffect(() => {
    const loadWallpaper = async () => {
      try {
        const wallpaper = await db.getWallpaper();
        if (wallpaper) {
          setWallpaperUrl(wallpaper);
        } else {
          const defaultWallpaper = getDefaultWallpaper();
          if (defaultWallpaper) {
            setWallpaperUrl(defaultWallpaper);
          }
        }
      } catch (error) {
        console.error('Error loading wallpaper:', error);
        const defaultWallpaper = getDefaultWallpaper();
        if (defaultWallpaper) {
          setWallpaperUrl(defaultWallpaper);
        }
      }
    };
    loadWallpaper();
  }, []);

  const handleDeleteProject = async (project: Project) => {
    if (confirm(`Are you sure you want to delete "${project.name}"?`)) {
      try {
        await onDeleteProject(project);
      } catch (error) {
        console.error('Failed to delete project:', error);
        alert('Failed to delete project. Please try again.');
      }
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Filter and sort projects based on search query (most recent first)
  const filteredProjects = projects
    .filter(project =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.framework && project.framework.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-white to-sakura-50 dark:from-gray-900 dark:to-gray-800 relative overflow-hidden">
      {/* Wallpaper */}
      {wallpaperUrl && (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 z-0"
          style={{
            backgroundImage: `url(${wallpaperUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.4,
            filter: 'blur(1px)',
            pointerEvents: 'none'
          }}
        />
      )}

      {/* Content with relative z-index */}
      <div className="relative z-10 h-full flex flex-col">
        {/* Header */}
        <div className="pt-12 px-8 flex-shrink-0">
          <div className="glassmorphic px-6 py-6 rounded-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <i className="fas fa-rocket w-8 h-8 text-sakura-500 text-2xl"></i>
                  <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">LumaUI</h1>
                </div>
                <p className="text-gray-600 dark:text-gray-400">Build full-stack applications with Local AI models and your own APIs (For Local Model editor's Choice is <strong>Qwen30b-A3B-instruct, Qwen3</strong>)</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={onCreateNew}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 dark:bg-sakura-500 dark:hover:bg-sakura-600 text-white rounded-lg flex items-center gap-2 font-medium transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <Plus className="w-5 h-5" />
                  Create Project
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 glassmorphic-card border border-white/30 dark:border-gray-700/50 dark:bg-gray-900/50 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-sakura-500 focus:border-blue-500 dark:focus:border-sakura-500 w-80"
                  />
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {filteredProjects.length} of {projects.length} projects
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-blue-100 dark:bg-sakura-900/30 text-blue-700 dark:text-sakura-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === 'list'
                      ? 'bg-blue-100 dark:bg-sakura-900/30 text-blue-700 dark:text-sakura-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - Canvas Area */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Canvas Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="h-full p-6">

          {filteredProjects.length === 0 && projects.length === 0 ? (
                /* Empty State */
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-sakura-900/30 dark:to-sakura-800/30 rounded-full flex items-center justify-center shadow-lg">
                      <FolderOpen className="w-10 h-10 text-blue-600 dark:text-sakura-400" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-3">
                      No Projects Yet
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                      Get started by creating your first project with WebContainers!
                    </p>
                    <button
                      onClick={onCreateNew}
                      className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 dark:from-sakura-500 dark:to-sakura-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 dark:hover:from-sakura-600 dark:hover:to-sakura-700 transition-all mx-auto text-sm font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                    >
                      <Plus className="w-4 h-4" />
                      Create Your First Project
                    </button>
                  </div>
                </div>
              ) : filteredProjects.length === 0 && projects.length > 0 ? (
                /* No search results */
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900/30 dark:to-gray-800/30 rounded-full flex items-center justify-center">
                      <Search className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
                      No projects found
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      Try adjusting your search terms or create a new project.
                    </p>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="px-4 py-2 bg-blue-100 dark:bg-sakura-900/30 hover:bg-blue-200 dark:hover:bg-sakura-900/50 text-blue-700 dark:text-sakura-300 rounded-lg text-sm font-medium transition-colors"
                    >
                      Clear Search
                    </button>
                  </div>
                </div>
              ) : (
                /* Projects Grid/List */
                <div className="flex-1 overflow-y-auto">
                  <div className="px-8 py-6">
                    {viewMode === 'grid' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredProjects.map((project) => (
                          <div
                            key={project.id}
                            className="group glassmorphic rounded-xl hover:border-blue-300 dark:hover:border-sakura-500 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                          >
                            {/* Header Section */}
                            <div className="p-4 border-b border-white/20 dark:border-gray-700/50">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 dark:from-sakura-500 dark:to-pink-500 rounded-lg flex items-center justify-center text-white text-lg">
                                    🚀
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate">
                                      {project.name}
                                    </h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {project.framework}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                                <div className="w-3 h-3 mr-1">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <polyline points="12 6 12 12 16 14"></polyline>
                                  </svg>
                                </div>
                                {formatDate(project.createdAt)}
                              </div>
                              {project.status === 'running' && (
                                <div className="mt-2 flex items-center gap-1">
                                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                  <span className="text-xs text-green-600 dark:text-green-400">Running</span>
                                </div>
                              )}
                            </div>

                            {/* Action Buttons Section */}
                            <div className="p-4">
                              <div className="flex items-center justify-center gap-4">
                                <button
                                  onClick={() => onSelectProject(project, 'play')}
                                  className="group relative w-12 h-12 bg-gradient-to-r from-blue-500 to-blue-600 dark:from-sakura-500 dark:to-sakura-600 hover:from-blue-600 hover:to-blue-700 dark:hover:from-sakura-600 dark:hover:to-sakura-700 text-white rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                                  title="Play - Preview Only"
                                >
                                  <Play className="w-5 h-5 transition-transform group-hover:scale-110" />
                                  <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                </button>

                                <button
                                  onClick={() => onSelectProject(project, 'edit')}
                                  className="group relative w-12 h-12 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                                  title="Edit - Full IDE"
                                >
                                  <Edit className="w-5 h-5 transition-transform group-hover:scale-110" />
                                  <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteProject(project);
                                  }}
                                  className="group relative w-12 h-12 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                                  title="Delete Project"
                                >
                                  <Trash2 className="w-5 h-5 transition-transform group-hover:scale-110" />
                                  <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {filteredProjects.map((project) => (
                          <div
                            key={project.id}
                            className="group glassmorphic rounded-xl hover:border-blue-300 dark:hover:border-sakura-500 hover:shadow-lg transition-all duration-200"
                          >
                            <div className="p-6">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 dark:from-sakura-500 dark:to-pink-500 rounded-lg flex items-center justify-center text-white text-xl flex-shrink-0">
                                    🚀
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-1">
                                      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 truncate">
                                        {project.name}
                                      </h3>
                                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                        <span>{project.framework}</span>
                                      </div>
                                      {project.status === 'running' && (
                                        <div className="flex items-center gap-1">
                                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                          <span className="text-xs text-green-600 dark:text-green-400">Running</span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 mr-1">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <polyline points="12 6 12 12 16 14"></polyline>
                                      </svg>
                                      <span>Created {formatDate(project.createdAt)}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 ml-4">
                                  <button
                                    onClick={() => onSelectProject(project, 'play')}
                                    className="group relative w-12 h-12 bg-gradient-to-r from-blue-500 to-blue-600 dark:from-sakura-500 dark:to-sakura-600 hover:from-blue-600 hover:to-blue-700 dark:hover:from-sakura-600 dark:hover:to-sakura-700 text-white rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                                    title="Play - Preview Only"
                                  >
                                    <Play className="w-5 h-5 transition-transform group-hover:scale-110" />
                                    <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                  </button>

                                  <button
                                    onClick={() => onSelectProject(project, 'edit')}
                                    className="group relative w-12 h-12 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                                    title="Edit - Full IDE"
                                  >
                                    <Edit className="w-5 h-5 transition-transform group-hover:scale-110" />
                                    <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                  </button>

                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteProject(project);
                                    }}
                                    className="group relative w-12 h-12 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white rounded-xl transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                                    title="Delete Project"
                                  >
                                    <Trash2 className="w-5 h-5 transition-transform group-hover:scale-110" />
                                    <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectManager;
