const { auth } = require('../firebase');

// Cache em memória para as permissões do banco para evitar custos de leitura repetitiva
let permissionsCache = {
    data: null,
    lastFetched: 0
};
const CACHE_TTL = 60 * 1000; // 1 minuto de TTL

const verifyToken = async (req, res, next) => {
    const bearerHeader = req.headers['authorization'];

    if (!bearerHeader || !bearerHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
    }

    const idToken = bearerHeader.split('Bearer ')[1];

    try {
        const decodedToken = await auth.verifyIdToken(idToken);
        req.user = decodedToken; // Adiciona os dados básicos
        
        // 🚨 CAMADA DE SEGURANÇA EXTRA: Buscar o cargo real no Banco de Dados
        const { db } = require('../firebase');
        const userDoc = await db.collection('users').doc(req.user.uid).get();
        req.user.role = userDoc.exists ? userDoc.data().role : 'visitante';
        
        // Se for um endpoint perigoso de /usuarios e não for ADM, bloqueia na hora!
        // AVISO: Liberar /usuarios/me e GET /usuarios/config/permissions para que usuários possam buscar suas credenciais e permissões.
        const isSelfInfo = req.path.startsWith('/me');
        const isGetPermissions = req.path.startsWith('/config/permissions') && req.method === 'GET';

        if (req.baseUrl.includes('/usuarios') && !isSelfInfo && !isGetPermissions && req.user.role !== 'adm_l1' && req.user.role !== 'adm_l2') {
             return res.status(403).json({ error: 'Acesso Negado. Você não tem privilégios de Administrador.' });
        }

        next();
    } catch (error) {
        console.error('Erro ao verificar o token:', error);
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
};

// Middleware para verificar permissões de módulos específicos
const requireModulePermission = (moduleName) => {
    return async (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: 'Acesso negado. Informações do usuário não encontradas.' });
        }

        const role = req.user.role;

        // ADM N1 sempre possui acesso irrestrito
        if (role === 'adm_l1') {
            return next();
        }

        const requiredAction = req.method === 'GET' ? 'view' : 'execute';

        // Tentar buscar as permissões do cache ou Firestore
        let perms = null;
        const now = Date.now();
        if (permissionsCache.data && (now - permissionsCache.lastFetched) < CACHE_TTL) {
            perms = permissionsCache.data;
        } else {
            try {
                const { db } = require('../firebase');
                const snap = await db.collection('config').doc('permissions').get();
                if (snap.exists) {
                    perms = snap.data();
                    permissionsCache.data = perms;
                    permissionsCache.lastFetched = now;
                }
            } catch (err) {
                console.error('Erro ao ler permissões dinâmicas do Firestore:', err);
            }
        }

        // Se encontrou as permissões no banco e estão configuradas para o cargo
        if (perms && perms[role] && perms[role][moduleName]) {
            const hasAccess = perms[role][moduleName][requiredAction];
            if (hasAccess) {
                return next();
            }
            return res.status(403).json({ error: `Acesso Negado. Seu cargo (${role}) não possui privilégios de ${requiredAction === 'view' ? 'visualização' : 'execução'} para o módulo ${moduleName}.` });
        }

        // Fallback de segurança para permissões padrão
        const defaultPermissions = {
            adm_l2: {
                emprestimo: { view: true, execute: true },
                usuarios: { view: true, execute: true },
                ensalamento: { view: true, execute: true },
                'carga-horaria': { view: true, execute: true }
            },
            ti: {
                emprestimo: { view: true, execute: true },
                usuarios: { view: false, execute: false },
                ensalamento: { view: true, execute: true },
                'carga-horaria': { view: false, execute: false }
            },
            rh: {
                emprestimo: { view: false, execute: false },
                usuarios: { view: false, execute: false },
                ensalamento: { view: false, execute: false },
                'carga-horaria': { view: true, execute: true }
            },
            visitante: {
                emprestimo: { view: true, execute: false },
                usuarios: { view: false, execute: false },
                ensalamento: { view: true, execute: false },
                'carga-horaria': { view: false, execute: false }
            }
        };

        const roleDefault = defaultPermissions[role] || defaultPermissions['visitante'];
        const hasAccess = roleDefault[moduleName] && roleDefault[moduleName][requiredAction];

        if (hasAccess) {
            return next();
        }

        return res.status(403).json({ error: `Acesso Negado. Seu cargo (${role}) não possui permissão para acessar este módulo.` });
    };
};

verifyToken.requireModulePermission = requireModulePermission;

module.exports = verifyToken;

