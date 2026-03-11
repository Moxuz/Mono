const app = require('./src/app');

console.log('=== Checking Routes ===\n');

// Function to list all routes
function listRoutes(app) {
    const routes = [];
    
    app._router.stack.forEach(function(middleware) {
        if (middleware.route) {
            // Routes registered directly on the app
            routes.push({
                method: Object.keys(middleware.route.methods)[0].toUpperCase(),
                path: middleware.route.path
            });
        } else if (middleware.name === 'router') {
            // Router middleware
            middleware.handle.stack.forEach(function(handler) {
                if (handler.route) {
                    const path = middleware.regexp.source
                        .replace('\\/?', '')
                        .replace('(?=\\/|$)', '')
                        .replace(/\\\//g, '/')
                        .replace('^', '');
                    
                    routes.push({
                        method: Object.keys(handler.route.methods)[0].toUpperCase(),
                        path: path + handler.route.path
                    });
                }
            });
        }
    });
    
    return routes;
}

const routes = listRoutes(app);

console.log('Total routes:', routes.length);
console.log('\nAPI Auth Routes:');
routes.filter(r => r.path.includes('/api/auth')).forEach(r => {
    console.log(`  ${r.method.padEnd(6)} ${r.path}`);
});

console.log('\nAPI OAuth Routes:');
routes.filter(r => r.path.includes('/api/oauth')).forEach(r => {
    console.log(`  ${r.method.padEnd(6)} ${r.path}`);
});

console.log('\nAPI User Routes:');
routes.filter(r => r.path.includes('/api/users')).forEach(r => {
    console.log(`  ${r.method.padEnd(6)} ${r.path}`);
});

console.log('\n=== End Routes ===');