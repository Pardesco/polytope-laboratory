const topic = (id, title, goal, where, intro, steps, tips, related, keywords) => ({
  id,
  title,
  goal,
  where,
  paragraphs: [intro],
  steps,
  tips,
  related,
  keywords,
});
export const LATE_FEATURE_TOPICS = [
  topic(
    'uniform-compounds',
    'Create and adjust a uniform compound',
    'Construct & modify',
    'Construct → Combine → Uniform compound',
    'Create a named Skilling compound with separate colored components, or record a parameter edit on the current compound.',
    [
      'Choose a Skilling number and, for a rotational family, enter Rotation θ in degrees.',
      'For UC20–UC25, expand Polygon and repetition to set n, d and k.',
      'Choose Create compound for a new document. Apply parameters updates the selected UC model with Undo/Redo history.',
    ],
    'Angles accept expressions from −360 to 360 degrees. Only UC20–UC25 have variable polygons and repetitions. Coincident constituents retain separate incidence; no union volume or exact certificate is inferred. Unsupported parameters refuse explicitly.',
    ['compounds', 'generator-options'],
    'Skilling UC1 UC75 rotation angle parameters'
  ),
  topic(
    'polychoron-relationships',
    'Inspect 4D compounds and scaliforms',
    'Inspect & measure',
    'Library → 4D compounds / Scaliform polychora; Analysis → 4D compounds / scaliforms',
    'Inspect the retained frame, constituent multiplicity and source classification of the supported finite catalog slice.',
    [
      'Open a 4D compound or scaliform from the Library.',
      'Read frame positions and multiplicity; Open frame type opens the related library model.',
      'Choose Check literal vertex links and expand Construction evidence and limits for residuals.',
    ],
    'Connectivity uses literal source IDs without welding coincident coordinates. Connected vertex links do not classify fissary behavior at every rank. Unknown classification remains unknown. The finite catalog and numerical checks are not a full compound/scaliform classification or exact certificate.',
    ['library', 'information', 'compounds'],
    '4D frame scaliform fissary vertex links'
  ),
  topic(
    'star-polychora',
    'Explore native star uniform polychora',
    'Explore the library',
    'Library → Star uniform polychora (Wythoffian); Analysis → Element types',
    'The bounded native Wythoffian catalog retains ordered star face cycles and published cell inventories.',
    [
      'Choose Star uniform polychora (Wythoffian) in Library, or search a Bowers acronym.',
      'Read the named cell inventory under Element types and choose a cell type to select its source cells.',
      'Expand Construction evidence to read numerical residuals and references.',
    ],
    'The inventory requires a complete match to the generated source; it does not claim a complete symmetry search. The 79-entry subset is not the full uniform-polychoron catalog. Self-intersections do not define a filled 4D interior.',
    ['visibility', 'generalized-4d', 'density-sections'],
    'star Wythoffian polychora Bowers cell inventory'
  ),
  topic(
    'media-export',
    'Choose image and video export options',
    'Animation & video',
    'Animation / Tours → Timeline → Export video or Export settings; View options → PNG options',
    'Render prepared scenes at the selected output dimensions and evaluate animation frames at deterministic source times.',
    [
      'Open Animation or Tours on the viewport shelf. In the docked Timeline, choose Export video for the Video dialog, or expand Export settings for the original controls.',
      'Choose WebM, MP4, animated GIF or PNG sequence, then output size, framing, margin and antialiasing. For a still use View options → PNG options.',
      'Choose Export selected format (or Export in the Video dialog). For a still choose Snapshot (PNG). Keep the source unchanged through destination review.',
    ],
    'Every format awaits deterministic mathematical source samples. PNG sequence includes a manifest of those source times. WebM stores explicit pose timestamps rounded to microseconds; MP4 places the rendered samples at frame-index/FPS cadence, including any final endpoint sample. GIF rounds each delay to centiseconds (minimum one) and quantizes to at most 256 palette colors. MP4/WebM require supported H.264/VP8 WebCodecs encoders; unavailable encoders refuse without a real-time fallback. Video/GIF output is opaque; transparent PNG is a separate still-image option. Fit model adapts the camera to the output aspect; Match viewport can crop. Target stereo is unsupported. GPU limits can reduce supersampling with a diagnostic. Device pixels, compression bytes, hardware encoders and all format/pose combinations still need shipped qualification.',
    ['animation-4d', 'images', 'stereo', 'unsupported-domains'],
    'MP4 H.264 GIF WebM PNG manifest cadence centisecond transparent 4K target resolution supersampling export options'
  ),
  topic(
    'presentation',
    'Present and record a playlist',
    'Styles & images',
    'Workspace shelf → Presentation; View → Presentation (F5)',
    'Show the current model, a saved tour, the featured gallery or filtered library results in a fullscreen presentation.',
    [
      'Choose a Playlist and set seconds per slide, transition time, repetition and captions.',
      'Choose Start presentation or press F5. Arrows change slides, Space pauses and C toggles captions.',
      'Press Escape to exit. To export one pass, expand Record presentation, choose media settings and Record presentation.',
    ],
    'Presentations preserve source documents and saved tours. Other playback and file actions must finish first. Playlists are bounded to 100 slides; recordings to 300 seconds. Unsupported entries refuse the playlist. Recordings share the media export limits. Actual fullscreen, GPU and native dialogs need desktop qualification.',
    ['media-export', 'appearance', 'animation-4d'],
    'F5 fullscreen showcase playlist captions record presentation'
  ),
];
export const LATE_GROUP_TOPICS = {
  'uniform-compound-settings': 'uniform-compounds',
  'uc-polygon-options': 'uniform-compounds',
  'polychoron-relationships': 'polychoron-relationships',
  'polychoron-construction-evidence': 'polychoron-relationships',
  'star-uniform4-cell-types': 'star-polychora',
  'star-uniform4-evidence': 'star-polychora',
  'presentation-settings': 'presentation',
};
