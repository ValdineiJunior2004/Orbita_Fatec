const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const verifyToken = require('../middlewares/auth');

// Middleware para verificar permissão do módulo 'ferida' (Gestão Saúde)
// ⚠️ Dado de saúde de paciente = dado pessoal sensível (LGPD).
// Todo acesso passa por token + RBAC e todo registro guarda autoria/data.
const checkPermission = verifyToken.requireModulePermission('ferida');

const COL_PACIENTES = 'ferida_pacientes';

// ==========================================
// PACIENTES
// ==========================================

// GET /api/ferida/pacientes - Listar pacientes do ambulatório
router.get('/pacientes', verifyToken, checkPermission, async (req, res) => {
    try {
        const snap = await db.collection(COL_PACIENTES).orderBy('nome').get();
        const pacientes = [];
        snap.forEach(doc => pacientes.push({ id: doc.id, ...doc.data() }));
        res.json(pacientes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/ferida/pacientes - Cadastrar novo paciente
router.post('/pacientes', verifyToken, checkPermission, async (req, res) => {
    try {
        const { nome, dataNascimento, municipio } = req.body;

        if (!nome || !nome.trim()) {
            return res.status(400).json({ error: 'O nome do paciente é obrigatório.' });
        }

        const newDoc = db.collection(COL_PACIENTES).doc();
        await newDoc.set({
            nome: nome.trim(),
            dataNascimento: dataNascimento || null,
            municipio: (municipio || '').trim(),
            createdAt: new Date().toISOString(),
            createdBy: req.user.uid,
            createdByName: req.user.name || req.user.email || ''
        });
        res.status(201).json({ message: 'Paciente cadastrado com sucesso!', id: newDoc.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/ferida/pacientes/:id - Atualizar dados cadastrais do paciente
router.put('/pacientes/:id', verifyToken, checkPermission, async (req, res) => {
    try {
        const { nome, dataNascimento, municipio } = req.body;

        if (!nome || !nome.trim()) {
            return res.status(400).json({ error: 'O nome do paciente é obrigatório.' });
        }

        await db.collection(COL_PACIENTES).doc(req.params.id).update({
            nome: nome.trim(),
            dataNascimento: dataNascimento || null,
            municipio: (municipio || '').trim(),
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.uid
        });
        res.json({ message: 'Paciente atualizado com sucesso!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ATENDIMENTOS (avaliações da ferida)
// ==========================================

// GET /api/ferida/pacientes/:id/atendimentos - Histórico do paciente (mais antigo primeiro)
router.get('/pacientes/:id/atendimentos', verifyToken, checkPermission, async (req, res) => {
    try {
        const snap = await db.collection(COL_PACIENTES).doc(req.params.id)
            .collection('atendimentos')
            .orderBy('createdAt', 'asc')
            .get();
        const atendimentos = [];
        snap.forEach(doc => atendimentos.push({ id: doc.id, ...doc.data() }));
        res.json(atendimentos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/ferida/pacientes/:id/atendimentos - Registrar avaliação da ferida
router.post('/pacientes/:id/atendimentos', verifyToken, checkPermission, async (req, res) => {
    try {
        const pacienteRef = db.collection(COL_PACIENTES).doc(req.params.id);
        const pacienteDoc = await pacienteRef.get();
        if (!pacienteDoc.exists) {
            return res.status(404).json({ error: 'Paciente não encontrado.' });
        }

        const {
            dimensoes,            // { comprimento, largura, profundidade, descolamento } em cm
            marcacoes,            // [{ numero, regiao, x, y, rotulo }]
            tecido,               // ["Granulação", ...]
            bordas,               // ["Maceração", ...]
            exsudato,             // { tipo, cor, consistencia, quantidade }
            infeccaoSuperficial,  // ["Odor", ...]
            infeccaoProfunda,     // ["Edema", ...]
            biofilme,             // true | false | null
            conduta               // texto livre
        } = req.body;

        const temConteudo =
            (Array.isArray(marcacoes) && marcacoes.length) ||
            (dimensoes && Object.values(dimensoes).some(v => v !== null && v !== undefined)) ||
            (Array.isArray(tecido) && tecido.length) ||
            (Array.isArray(bordas) && bordas.length) ||
            (exsudato && Object.values(exsudato).some(Boolean)) ||
            (Array.isArray(infeccaoSuperficial) && infeccaoSuperficial.length) ||
            (Array.isArray(infeccaoProfunda) && infeccaoProfunda.length) ||
            biofilme !== null && biofilme !== undefined ||
            (conduta && conduta.trim());

        if (!temConteudo) {
            return res.status(400).json({ error: 'O atendimento está vazio. Preencha a avaliação antes de salvar.' });
        }

        const num = v => {
            if (v === null || v === undefined || v === '') return null;
            const n = parseFloat(String(v).replace(',', '.'));
            return isNaN(n) ? null : n;
        };

        const newDoc = pacienteRef.collection('atendimentos').doc();
        await newDoc.set({
            dimensoes: {
                comprimento:  num(dimensoes?.comprimento),
                largura:      num(dimensoes?.largura),
                profundidade: num(dimensoes?.profundidade),
                descolamento: num(dimensoes?.descolamento)
            },
            marcacoes: Array.isArray(marcacoes) ? marcacoes.map(m => ({
                numero: parseInt(m.numero) || 0,
                regiao: String(m.regiao || ''),
                x: num(m.x),
                y: num(m.y),
                rotulo: String(m.rotulo || '').trim()
            })) : [],
            tecido:              Array.isArray(tecido) ? tecido : [],
            bordas:              Array.isArray(bordas) ? bordas : [],
            exsudato: {
                tipo:         exsudato?.tipo         || null,
                cor:          exsudato?.cor          || null,
                consistencia: exsudato?.consistencia || null,
                quantidade:   exsudato?.quantidade   || null
            },
            infeccaoSuperficial: Array.isArray(infeccaoSuperficial) ? infeccaoSuperficial : [],
            infeccaoProfunda:    Array.isArray(infeccaoProfunda) ? infeccaoProfunda : [],
            biofilme:            typeof biofilme === 'boolean' ? biofilme : null,
            conduta:             (conduta || '').trim(),
            // Autoria obrigatória (LGPD): quem registrou, quando
            createdAt:     new Date().toISOString(),
            createdBy:     req.user.uid,
            createdByName: req.user.name || req.user.email || ''
        });

        res.status(201).json({ message: 'Atendimento registrado com sucesso!', id: newDoc.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// FICHAS ANTIGAS (digitalização da ficha de papel)
// ==========================================

// Limite seguro: documento do Firestore aceita no máx. 1 MiB.
// A imagem chega como data URL base64 comprimida no navegador.
const MAX_IMG_BASE64 = 980000;

// GET /api/ferida/pacientes/:id/fichas-antigas - Listar (só metadados; a imagem é pesada)
router.get('/pacientes/:id/fichas-antigas', verifyToken, checkPermission, async (req, res) => {
    try {
        const snap = await db.collection(COL_PACIENTES).doc(req.params.id)
            .collection('fichas_antigas')
            .orderBy('createdAt', 'asc')
            .select('nome', 'mimeType', 'tamanho', 'createdAt', 'createdBy', 'createdByName')
            .get();
        const fichas = [];
        snap.forEach(doc => fichas.push({ id: doc.id, ...doc.data() }));
        res.json(fichas);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/ferida/pacientes/:id/fichas-antigas/:fichaId - Buscar a imagem completa
router.get('/pacientes/:id/fichas-antigas/:fichaId', verifyToken, checkPermission, async (req, res) => {
    try {
        const doc = await db.collection(COL_PACIENTES).doc(req.params.id)
            .collection('fichas_antigas').doc(req.params.fichaId).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Ficha antiga não encontrada.' });
        }
        res.json({ id: doc.id, ...doc.data() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/ferida/pacientes/:id/fichas-antigas - Anexar imagem da ficha de papel
router.post('/pacientes/:id/fichas-antigas', verifyToken, checkPermission, async (req, res) => {
    try {
        const pacienteRef = db.collection(COL_PACIENTES).doc(req.params.id);
        const pacienteDoc = await pacienteRef.get();
        if (!pacienteDoc.exists) {
            return res.status(404).json({ error: 'Paciente não encontrado.' });
        }

        const { imagem, nome } = req.body;
        if (!imagem || typeof imagem !== 'string' || !imagem.startsWith('data:image/')) {
            return res.status(400).json({ error: 'Envie uma imagem válida.' });
        }
        if (imagem.length > MAX_IMG_BASE64) {
            return res.status(400).json({ error: 'Imagem muito grande mesmo após compressão. Tente uma foto com resolução menor.' });
        }

        const mimeType = imagem.substring(5, imagem.indexOf(';'));
        const newDoc = pacienteRef.collection('fichas_antigas').doc();
        await newDoc.set({
            nome: String(nome || 'ficha-antiga').trim(),
            imagem,
            mimeType,
            tamanho: imagem.length,
            // Autoria obrigatória (LGPD)
            createdAt: new Date().toISOString(),
            createdBy: req.user.uid,
            createdByName: req.user.name || req.user.email || ''
        });
        res.status(201).json({ message: 'Ficha antiga anexada com sucesso!', id: newDoc.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/ferida/pacientes/:id/fichas-antigas/:fichaId - Remover anexo equivocado
router.delete('/pacientes/:id/fichas-antigas/:fichaId', verifyToken, checkPermission, async (req, res) => {
    try {
        await db.collection(COL_PACIENTES).doc(req.params.id)
            .collection('fichas_antigas').doc(req.params.fichaId).delete();
        res.json({ message: 'Ficha antiga removida com sucesso!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/ferida/pacientes/:id/atendimentos/:atendimentoId - Remover registro equivocado
router.delete('/pacientes/:id/atendimentos/:atendimentoId', verifyToken, checkPermission, async (req, res) => {
    try {
        await db.collection(COL_PACIENTES).doc(req.params.id)
            .collection('atendimentos').doc(req.params.atendimentoId).delete();
        res.json({ message: 'Atendimento removido com sucesso!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
