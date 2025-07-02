import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import { body, param, validationResult } from 'express-validator';
import asyncHandler from 'express-async-handler';

import { fetchAll, fetchFirst, execute } from './sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Constants
const PORT = process.env.PORT || 5500;
const HASH_SALT_ROUNDS = 10;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';
const DEFAULT_BOUNDS = { lat: -33.8688, lon: 151.2093, zoom: 13 };

// Database connections
const mainDB = new sqlite3.Database('./db/main.db');
const shapesDB = new sqlite3.Database('./db/shapes.db');

// Middleware setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    name: 'sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production' }
}));

// Utilities
const assertValid = (req) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const msg = errors.array().map(e => e.msg).join('; ');
        const err = new Error(msg);
        err.status = 400;
        throw err;
    }
};

const mustBeLoggedIn = (req, res, next) => {
    if (!req.session.user) return res.redirect('/');
    next();
};

// Optimized database helpers
const checkMapAccess = async (userId, mapId) => {
    // Single query with LEFT JOIN instead of two separate queries
    const result = await fetchFirst(mainDB, `
        SELECT 1 FROM maps m 
        LEFT JOIN mapshares s ON m.map_id = s.map_id AND s.user_id = ?
        WHERE m.map_id = ? AND (m.owner_id = ? OR s.user_id IS NOT NULL)
    `, [userId, mapId, userId]);
    return Boolean(result);
};

const checkMapOwnership = async (userId, mapId) => {
    return Boolean(await fetchFirst(mainDB,
        'SELECT 1 FROM maps WHERE map_id = ? AND owner_id = ?',
        [mapId, userId]
    ));
};

// Optimized bounds calculation
const calculateBounds = (shapes) => {
    let minLat = 90, minLng = 180, maxLat = -90, maxLng = -180;
    let hasValidCoords = false;

    const processCoords = (coords) => {
        if (!Array.isArray(coords)) return;
        
        if (Array.isArray(coords[0])) {
            coords.forEach(processCoords);
        } else if (coords.length >= 2) {
            const [lng, lat] = coords;
            if (typeof lat === 'number' && typeof lng === 'number') {
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
                hasValidCoords = true;
            }
        }
    };

    shapes.forEach(shape => {
        try {
            const geojson = JSON.parse(shape.GEOJSON);
            if (geojson.type === 'Feature' && geojson.geometry) {
                processCoords(geojson.geometry.coordinates);
            } else if (geojson.type === 'FeatureCollection') {
                geojson.features?.forEach(f => f.geometry && processCoords(f.geometry.coordinates));
            } else if (geojson.coordinates) {
                processCoords(geojson.coordinates);
            }
        } catch (e) {
            console.warn('Invalid GeoJSON in shape:', shape.SHAPE_ID);
        }
    });

    return hasValidCoords ? [[minLat, minLng], [maxLat, maxLng]] : null;
};

// Validation middleware
const userValidation = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 32 }).withMessage('Username must be 3–32 characters')
        .matches(/^[\w.-]+$/).withMessage('Username can only contain letters, numbers, underscores, dots, and dashes')
        .escape(),
    body('password')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
        .escape()
];

const mapNameValidation = [
    body('name').trim().isLength({ min: 1 }).withMessage('Map name required').escape()
];

// Routes

// Authentication routes
app.post('/register', userValidation, asyncHandler(async (req, res) => {
    assertValid(req);
    
    const { username, password } = req.body;
    
    // Check if user exists
    const existing = await fetchFirst(mainDB, 'SELECT 1 FROM users WHERE username = ?', username);
    if (existing) return res.status(409).send('User already exists');

    // Create user
    const hash = await bcrypt.hash(password, HASH_SALT_ROUNDS);
    const insertId = await execute(mainDB,
        'INSERT INTO users (username, password) VALUES (?, ?)',
        [username, hash]);

    req.session.user = { ID: insertId, username };
    res.redirect('/hub');
}));

app.post('/auth', [
    body('username').trim().escape(),
    body('password').escape()
], asyncHandler(async (req, res) => {
    assertValid(req);

    const { username, password } = req.body;
    const user = await fetchFirst(mainDB, 'SELECT * FROM users WHERE username = ?', username);
    
    if (!user || !await bcrypt.compare(password, user.PASSWORD)) {
        return res.status(401).send('Invalid credentials');
    }

    req.session.user = { ID: user.ID, username: user.USERNAME };
    res.redirect('/hub');
}));

app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).send('Logout failed');
        res.clearCookie('sid');
        res.redirect('/');
    });
});

// Page routes
const renderWithUser = (template) => (req, res) => {
    res.render(template, { username: req.session.user?.username });
};

app.get('/', renderWithUser('index'));
app.get('/settings', renderWithUser('settings'));

// Hub - optimized with single query
app.get('/hub', mustBeLoggedIn, asyncHandler(async (req, res) => {
    const uid = req.session.user.ID;

    // Single query to get both owned and shared maps
    const maps = await fetchAll(mainDB, `
        SELECT m.*, 
               CASE WHEN m.owner_id = ? THEN 'owned' ELSE 'shared' END as access_type
        FROM maps m
        LEFT JOIN mapshares s ON m.map_id = s.map_id
        WHERE m.owner_id = ? OR s.user_id = ?
        ORDER BY access_type, m.name
    `, [uid, uid, uid]);

    const myMaps = maps.filter(m => m.access_type === 'owned');
    const sharedMaps = maps.filter(m => m.access_type === 'shared');

    res.render('hub', { myMaps, sharedMaps, username: req.session.user.username });
}));

// Map operations
app.post('/createMap', mustBeLoggedIn, mapNameValidation, asyncHandler(async (req, res) => {
    assertValid(req);

    const { name } = req.body;
    const mapId = await execute(mainDB,
        'INSERT INTO maps (name, owner_id) VALUES (?, ?)',
        [name, req.session.user.ID]);

    req.session.mapid = mapId;
    res.json({ id: mapId });
}));

app.post('/loadMap', mustBeLoggedIn, asyncHandler(async (req, res) => {
    const mapId = parseInt(req.body.mapID, 10);
    if (!mapId) return res.status(400).send('Invalid map ID');

    if (!await checkMapAccess(req.session.user.ID, mapId)) {
        return res.status(403).send('Access denied');
    }

    req.session.mapid = mapId;
    res.json({ success: true });
}));

app.get('/map', mustBeLoggedIn, asyncHandler(async (req, res) => {
    const mapId = req.session.mapid;
    if (!mapId) return res.redirect('/hub');

    const uid = req.session.user.ID;

    const [hasAccess, shapes, isOwner, user] = await Promise.all([
        checkMapAccess(uid, mapId),
        fetchAll(shapesDB, 'SELECT * FROM shapes WHERE map_id = ?', [mapId]),
        checkMapOwnership(uid, mapId),
        fetchFirst(mainDB, 'SELECT map_style FROM users WHERE id = ?', uid)
    ]);

    if (!hasAccess) return res.status(403).send('Access denied');

    const bounds = calculateBounds(shapes);

    // Map 'default' or null style to 'osm'
    let userMapStyle = user?.map_style;
    if (userMapStyle === 'default') userMapStyle = 'osm';

    res.render('map', {
        username: req.session.user.username,
        shapes,
        bounds,
        ...DEFAULT_BOUNDS,
        isOwner,
        userMapStyle
    });
}));


app.post('/deleteMap', mustBeLoggedIn, asyncHandler(async (req, res) => {
    const mapId = req.body.mapID;
    if (!mapId) return res.status(400).json({ error: 'Missing mapId' });

    if (!await checkMapOwnership(req.session.user.ID, mapId)) {
        return res.status(403).json({ error: 'You do not have permission to delete this map' });
    }

    // Delete in parallel for better performance
    await Promise.all([
        execute(mainDB, 'DELETE FROM mapshares WHERE map_id = ?', [mapId]),
        execute(shapesDB, 'DELETE FROM shapes WHERE map_id = ?', [mapId]),
        execute(mainDB, 'DELETE FROM maps WHERE map_id = ?', [mapId])
    ]);

    res.json({ success: true });
}));

// Shape operations
const shapeValidation = [body('name').trim().escape()];
const shapeIdValidation = [body('id').isInt().toInt()];
const styleValidation = [
    ...shapeIdValidation,
    body('color').trim().escape(),
    body('weight').isInt().toInt()
];

app.post('/createShape', mustBeLoggedIn, shapeValidation, asyncHandler(async (req, res) => {
    assertValid(req);
    const { shape, name } = req.body;
    const id = await execute(shapesDB,
        'INSERT INTO shapes (map_id, geojson, name) VALUES (?, ?, ?)',
        [req.session.mapid, JSON.stringify(shape), name]);
    res.json({ id });
}));

app.post('/updateShape', mustBeLoggedIn, shapeIdValidation, asyncHandler(async (req, res) => {
    assertValid(req);
    const { id, shape } = req.body;
    await execute(shapesDB,
        'UPDATE shapes SET geojson=? WHERE shape_id=? AND map_id=?',
        [JSON.stringify(shape), id, req.session.mapid]);
    res.json({ ok: true });
}));

app.post('/updateStyle', mustBeLoggedIn, styleValidation, asyncHandler(async (req, res) => {
    assertValid(req);
    const { id, color, weight } = req.body;
    await execute(shapesDB,
        'UPDATE shapes SET color=?, width=? WHERE shape_id=? AND map_id=?',
        [color, weight, id, req.session.mapid]);
    res.json({ ok: true });
}));

app.post('/renameShape', mustBeLoggedIn, asyncHandler(async (req, res) => {
    const { id, name } = req.body;
    if (!id || !name?.trim()) return res.status(400).json({ error: 'Missing id or name' });
    
    await execute(shapesDB,
        'UPDATE shapes SET name = ? WHERE shape_id = ? AND map_id = ?',
        [name.trim(), id, req.session.mapid]);
    res.json({ ok: true });
}));

app.post('/deleteShape', mustBeLoggedIn, asyncHandler(async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing shape id' });
    
    await execute(shapesDB,
        'DELETE FROM shapes WHERE shape_id = ? AND map_id = ?',
        [id, req.session.mapid]);
    res.json({ ok: true });
}));

// Sharing operations
const shareValidation = [body('editorUsername').trim().escape()];

app.post('/share', mustBeLoggedIn, shareValidation, asyncHandler(async (req, res) => {
    assertValid(req);
    const mapId = req.session.mapid;
    const owner = req.session.user.ID;
    const { editorUsername } = req.body;

    if (!await checkMapOwnership(owner, mapId)) {
        return res.status(403).json({ error: 'Not owner.' });
    }

    const editor = await fetchFirst(mainDB,
        'SELECT id FROM users WHERE username=?', editorUsername);
    if (!editor) return res.status(404).json({ error: 'User not found.' });

    if (editor.ID === owner) {
        return res.status(400).json({ error: "You can't share with yourself." });
    }

    // Check for existing share and insert if not exists in single query
    try {
        await execute(mainDB,
            'INSERT INTO mapshares (map_id, user_id) VALUES (?, ?)', 
            [mapId, editor.ID]);
        res.json({ ok: true });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json({ error: 'User is already editor.' });
        }
        throw err;
    }
}));

app.get('/editors', mustBeLoggedIn, asyncHandler(async (req, res) => {
    const mapId = req.session.mapid;
    
    if (!await checkMapOwnership(req.session.user.ID, mapId)) {
        return res.status(403).json({ error: 'Not owner' });
    }

    const editors = await fetchAll(mainDB, `
        SELECT u.username 
        FROM mapshares s
        JOIN users u ON s.user_id = u.ID
        WHERE s.map_id = ?
    `, [mapId]);
    res.json({ editors: editors.map(r => r.USERNAME) });
}));

app.post('/unshare', mustBeLoggedIn, shareValidation, asyncHandler(async (req, res) => {
    assertValid(req);
    const mapId = req.session.mapid;
    const { editorUsername } = req.body;

    if (!await checkMapOwnership(req.session.user.ID, mapId)) {
        return res.status(403).json({ error: 'Not owner' });
    }

    const editor = await fetchFirst(mainDB,
        'SELECT id FROM users WHERE username=?', editorUsername);
    if (!editor) return res.status(404).json({ error: 'User not found' });

    await execute(mainDB,
        'DELETE FROM mapshares WHERE map_id=? AND user_id=?', [mapId, editor.ID]);
    res.json({ ok: true });
}));

// preview shapes
app.get('/api/map/:mapid/shapes',
    param('mapid').isInt().toInt(),
    asyncHandler(async (req, res) => {
        assertValid(req);
        const shapes = await fetchAll(shapesDB,
            'SELECT * FROM shapes WHERE map_id=?', req.params.mapid);
        res.json(shapes);
    })
);

// Get current user's map style
app.get('/user/style', mustBeLoggedIn, asyncHandler(async (req, res) => {
    const result = await fetchFirst(mainDB, 'SELECT map_style FROM users WHERE id = ?', req.session.user.ID);

    res.json({ style: result?.map_style });
}));

// Update current user's map style
app.post('/user/style', mustBeLoggedIn, asyncHandler(async (req, res) => {
    const { style } = req.body;
    if (!style || typeof style !== 'string') return res.status(400).json({ error: 'Invalid style' });

    await execute(mainDB, 'UPDATE users SET map_style = ? WHERE id = ?', [style, req.session.user.ID]);
    res.json({ ok: true });
}));

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    if (process.env.NODE_ENV === 'development') {
        console.error(err.stack);
    }
    res.status(err.status || 500).json({ 
        error: err.message || 'Server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing databases...');
    mainDB.close();
    shapesDB.close();
    process.exit(0);
});

// Start server
app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});