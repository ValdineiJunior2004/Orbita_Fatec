const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const verifyToken = require('../middlewares/auth');

// GET /api/emprestimos - Retorna todos os notebooks
router.get('/', verifyToken, async (req, res) => {
    try {
        const snapshot = await db.collection('notebooks').get();
        const notebooks = [];
        snapshot.forEach(doc => {
            notebooks.push({ id: doc.id, ...doc.data() });
        });
        
        // Retorna ordenado pelo ID
        notebooks.sort((a, b) => a.id.localeCompare(b.id));
        res.json(notebooks);
    } catch (error) {
        console.error('Erro ao buscar empréstimos:', error);
        res.status(500).json({ error: 'Erro ao buscar dados.' });
    }
});

// GET /api/emprestimos/:id - Retorna um notebook específico
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const docRef = await db.collection('notebooks').doc(req.params.id).get();
        if (!docRef.exists) {
            return res.status(404).json({ error: 'Equipamento não encontrado.' });
        }
        res.json({ id: docRef.id, ...docRef.data() });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar equipamento.' });
    }
});

// PUT /api/emprestimos/:id - Atualiza ou cria o registro
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const data = req.body;
        
        // Remove o ID do payload para não duplicar dados dentro do documento
        if (data.id) delete data.id;
        
        await db.collection('notebooks').doc(id).set(data, { merge: true });
        res.json({ status: 'success', message: `Equipamento ${id} atualizado.` });
    } catch (error) {
        console.error('Erro ao atualizar empréstimo:', error);
        res.status(500).json({ error: 'Erro ao atualizar dados.' });
    }
});

module.exports = router;
