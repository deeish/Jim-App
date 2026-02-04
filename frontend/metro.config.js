const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Resolve @supabase/supabase-js to source when dist is missing (e.g. broken publish)
const supabaseSrc = path.resolve(
  __dirname,
  'node_modules/@supabase/supabase-js/src/index.ts'
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@supabase/supabase-js') {
    const fs = require('fs');
    const distMain = path.resolve(
      __dirname,
      'node_modules/@supabase/supabase-js/dist/main/index.js'
    );
    if (fs.existsSync(distMain)) {
      return context.resolveRequest(context, moduleName, platform);
    }
    if (fs.existsSync(supabaseSrc)) {
      return { type: 'sourceFile', filePath: supabaseSrc };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
