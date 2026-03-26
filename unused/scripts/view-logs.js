#!/usr/bin/env node

/**
 * System Log Viewer
 * View and analyze application logs
 * 
 * Usage:
 *   node scripts/view-logs.js              # View recent logs
 *   node scripts/view-logs.js --errors     # View errors only
 *   node scripts/view-logs.js --lines 100  # View last 100 lines
 *   node scripts/view-logs.js --stats      # Show log statistics
 *   node scripts/view-logs.js --search "login"  # Search logs
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '../logs');
const COMBINED_LOG = path.join(LOGS_DIR, 'combined.log');
const ERROR_LOG = path.join(LOGS_DIR, 'error.log');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
    errors: args.includes('--errors') || args.includes('-e'),
    stats: args.includes('--stats') || args.includes('-s'),
    search: args.find(arg => arg.startsWith('--search='))?.split('=')[1] || null,
    lines: parseInt(args.find(arg => !arg.startsWith('-')) || '20', 10)
};

// Check if log file exists
function checkLogFile() {
    const logFile = options.errors ? ERROR_LOG : COMBINED_LOG;
    if (!fs.existsSync(logFile)) {
        console.error(`❌ Log file not found: ${logFile}`);
        console.log('💡 Logs are created when the application runs');
        process.exit(1);
    }
    return logFile;
}

// Read last N lines from file
function readLastLines(filePath, lines) {
    const content = fs.readFileSync(filePath, 'utf8');
    const allLines = content.split('\n').filter(line => line.trim());
    return allLines.slice(-lines);
}

// Display logs
function displayLogs() {
    const logFile = checkLogFile();
    const lines = readLastLines(logFile, options.lines);
    
    console.log(`\n📄 Viewing: ${path.basename(logFile)}`);
    console.log(`📊 Last ${lines.length} lines\n`);
    console.log('─'.repeat(80));
    
    lines.forEach(line => {
        // Color code based on log level
        if (line.includes('[ERROR]')) {
            console.log('\x1b[31m%s\x1b[0m', line); // Red
        } else if (line.includes('[WARN]')) {
            console.log('\x1b[33m%s\x1b[0m', line); // Yellow
        } else if (line.includes('[INFO]')) {
            console.log('\x1b[36m%s\x1b[0m', line); // Cyan
        } else if (line.includes('[DEBUG]')) {
            console.log('\x1b[35m%s\x1b[0m', line); // Magenta
        } else if (line.includes('[HTTP]')) {
            console.log('\x1b[37m%s\x1b[0m', line); // White
        } else if (line.includes('[SECURITY]')) {
            console.log('\x1b[33m%s\x1b[0m', line); // Yellow
        } else {
            console.log(line);
        }
    });
    
    console.log('─'.repeat(80));
}

// Show log statistics
function showStats() {
    console.log('\n📊 Log Statistics\n');
    console.log('═'.repeat(60));
    
    const logFiles = [
        { name: 'combined.log', path: COMBINED_LOG },
        { name: 'error.log', path: ERROR_LOG }
    ];
    
    logFiles.forEach(file => {
        if (fs.existsSync(file.path)) {
            const stats = fs.statSync(file.path);
            const content = fs.readFileSync(file.path, 'utf8');
            const lines = content.split('\n').filter(l => l.trim()).length;
            
            // Count by level
            const infoCount = (content.match(/\[INFO\]/g) || []).length;
            const warnCount = (content.match(/\[WARN\]/g) || []).length;
            const errorCount = (content.match(/\[ERROR\]/g) || []).length;
            const httpCount = (content.match(/\[HTTP\]/g) || []).length;
            
            console.log(`\n📁 ${file.name}`);
            console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
            console.log(`   Lines: ${lines.toLocaleString()}`);
            console.log(`   Last Modified: ${stats.mtime.toLocaleString()}`);
            console.log(`   \n   By Level:`);
            console.log(`   • INFO:    ${infoCount.toLocaleString()}`);
            console.log(`   • WARN:    ${warnCount.toLocaleString()}`);
            console.log(`   • ERROR:   ${errorCount.toLocaleString()}`);
            console.log(`   • HTTP:    ${httpCount.toLocaleString()}`);
        } else {
            console.log(`\n❌ ${file.name} - Not found`);
        }
    });
    
    console.log('\n' + '═'.repeat(60));
    
    // Show recent errors summary
    if (fs.existsSync(ERROR_LOG)) {
        const errorContent = fs.readFileSync(ERROR_LOG, 'utf8');
        const errorLines = errorContent.split('\n').filter(l => l.trim());
        const recentErrors = errorLines.slice(-10);
        
        if (recentErrors.length > 0) {
            console.log('\n🔴 Recent Errors (Last 10)\n');
            recentErrors.forEach(line => {
                console.log('\x1b[31m%s\x1b[0m', line);
            });
        }
    }
    
    console.log('\n');
}

// Search logs
function searchLogs() {
    const logFile = checkLogFile();
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    const searchTerm = options.search.toLowerCase();
    
    const matchingLines = lines.filter(line => 
        line.toLowerCase().includes(searchTerm)
    );
    
    console.log(`\n🔍 Search Results for: "${options.search}"`);
    console.log(`📄 File: ${path.basename(logFile)}`);
    console.log(`📊 Found: ${matchingLines.length} matches\n`);
    console.log('─'.repeat(80));
    
    matchingLines.slice(-options.lines).forEach(line => {
        // Highlight search term
        const regex = new RegExp(options.search, 'gi');
        const highlighted = line.replace(regex, match => `\x1b[7m${match}\x1b[0m`);
        
        if (line.includes('[ERROR]')) {
            console.log('\x1b[31m%s\x1b[0m', highlighted);
        } else if (line.includes('[WARN]')) {
            console.log('\x1b[33m%s\x1b[0m', highlighted);
        } else {
            console.log(highlighted);
        }
    });
    
    console.log('─'.repeat(80));
}

// Main execution
try {
    if (options.stats) {
        showStats();
    } else if (options.search) {
        searchLogs();
    } else {
        displayLogs();
    }
} catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
}
