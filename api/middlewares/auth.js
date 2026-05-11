const { auth } = require('../firebase');

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
        // AVISO: Liberar /usuarios/me para que o próprio usuário possa buscar sua role.
        if (req.baseUrl.includes('/usuarios') && req.path !== '/me' && req.user.role !== 'adm_l1' && req.user.role !== 'adm_l2') {
             return res.status(403).json({ error: 'Acesso Negado. Você não tem privilégios de Administrador.' });
        }

        next();
    } catch (error) {
        console.error('Erro ao verificar o token:', error);
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
};

module.exports = verifyToken;
