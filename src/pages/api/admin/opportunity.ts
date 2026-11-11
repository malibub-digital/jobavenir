export const prerender = false;

import type { APIRoute } from 'astro';
import crypto from 'crypto';
import { hashSha256 } from '@malihub/sites-core/utils/auth.js';
import { queryDb, insertIdea } from '../../../lib/db';
import { calculateDefaultSocialPublishAt, generateSocialTexts } from '../../../lib/social-generator';
import { generateJobOgImage } from '../../../lib/og-generator';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80);
}

async function isAuthenticated(request: Request): Promise<boolean> {
  const rawSecret = (typeof import.meta !== 'undefined' && import.meta.env?.CMS_ADMIN_SECRET) || process.env.CMS_ADMIN_SECRET || 'admin123';
  const expectedHash = await hashSha256(rawSecret);

  // Vérifier cookie cms_admin_token ou ml_admin_token
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:cms_admin_token|ml_admin_token)=([^;]+)/);
  if (match && decodeURIComponent(match[1]) === expectedHash) {
    return true;
  }

  // Vérifier en-tête Authorization: Bearer <hash>
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ') && authHeader.slice(7).trim() === expectedHash) {
    return true;
  }

  return false;
}

export const GET: APIRoute = async ({ request }) => {
  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Accès non autorisé' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'job';
  const slug = url.searchParams.get('slug');
  const q = (url.searchParams.get('q') || '').trim();
  const activeFilter = url.searchParams.get('active'); // 'true' | 'false' | 'all'
  const limitParam = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 100);

  // Mode Liste / Recherche si aucun slug n'est fourni
  if (!slug) {
    try {
      const items: any[] = [];

      if (type === 'job' || type === 'all') {
        const params: any[] = [];
        let where = 'WHERE 1=1';
        if (activeFilter === 'true') {
          params.push(true);
          where += ` AND is_active = $${params.length}`;
        } else if (activeFilter === 'false') {
          params.push(false);
          where += ` AND is_active = $${params.length}`;
        }
        if (q) {
          params.push(`%${q.toLowerCase()}%`);
          const p = `$${params.length}`;
          where += ` AND (LOWER(title) LIKE ${p} OR LOWER(company) LIKE ${p} OR LOWER(slug) LIKE ${p} OR LOWER(COALESCE(category, '')) LIKE ${p} OR LOWER(COALESCE(location, '')) LIKE ${p})`;
        }
        params.push(limitParam);
        const resJobs = await queryDb(`
          SELECT id, slug, title, company, location, contract_type as "contractType",
                 COALESCE(opportunity_type, 'JOB') as "opportunityType",
                 category, deadline, to_char(published_date, 'YYYY-MM-DD') as "publishedDate",
                 is_active as "isActive", social_status as "socialStatus"
          FROM jobs
          ${where}
          ORDER BY published_date DESC, id DESC
          LIMIT $${params.length}
        `, params);

        for (const r of resJobs.rows) {
          items.push({
            ...r,
            type: 'job',
            isActive: Boolean(r.isActive),
            url: `https://job.malihub.digital/opportunites/${r.slug}`
          });
        }
      }

      if (type === 'idea' || type === 'all') {
        const params: any[] = [];
        let where = 'WHERE 1=1';
        if (activeFilter === 'true') {
          params.push(true);
          where += ` AND is_active = $${params.length}`;
        } else if (activeFilter === 'false') {
          params.push(false);
          where += ` AND is_active = $${params.length}`;
        }
        if (q) {
          params.push(`%${q.toLowerCase()}%`);
          const p = `$${params.length}`;
          where += ` AND (LOWER(title) LIKE ${p} OR LOWER(sector) LIKE ${p} OR LOWER(slug) LIKE ${p} OR LOWER(COALESCE(concept, '')) LIKE ${p})`;
        }
        params.push(limitParam);
        const resIdeas = await queryDb(`
          SELECT id, slug, title, sector as category, zone_cible as location,
                 demarrage_level as "contractType", is_active as "isActive",
                 social_status as "socialStatus", created_at as "publishedDate"
          FROM ideas
          ${where}
          ORDER BY id DESC
          LIMIT $${params.length}
        `, params);

        for (const r of resIdeas.rows) {
          items.push({
            ...r,
            type: 'idea',
            company: 'Idée business',
            opportunityType: 'IDEA',
            isActive: Boolean(r.isActive),
            url: `https://job.malihub.digital/idees/${r.slug}`
          });
        }
      }

      return new Response(JSON.stringify({
        success: true,
        count: items.length,
        items
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || 'Erreur lors de la recherche' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  const table = type === 'idea' ? 'ideas' : 'jobs';
  const res = await queryDb(`SELECT * FROM ${table} WHERE slug = $1`, [slug]);
  if (res.rows.length === 0) {
    return new Response(JSON.stringify({ error: 'Opportunité introuvable' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const row = res.rows[0];
  const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {});

  return new Response(JSON.stringify({
    success: true,
    data: {
      id: row.id,
      slug: row.slug,
      type,
      title: row.title,
      excerpt: row.excerpt || row.concept || '',
      description: row.description || row.besoin_identifie || '',
      heroImage: metadata.heroImage || null,
      requirements: typeof row.requirements === 'string'
        ? JSON.parse(row.requirements || '[]')
        : (row.requirements || (typeof row.competences_cles === 'string' ? JSON.parse(row.competences_cles || '[]') : (row.competences_cles || []))),
      howToApply: row.how_to_apply || row.premiere_action || '',
      company: row.company || '',
      location: row.location || row.zone_cible || '',
      contractType: row.contract_type || row.demarrage_level || '',
      opportunityType: row.opportunity_type || (type === 'idea' ? 'IDEA' : 'JOB'),
      category: row.category || row.sector || '',
      domain: row.domain || row.public_cible || '',
      salary: row.salary || '',
      deadline: row.deadline || '',
      publishedDate: row.published_date || row.created_at || '',
      originalUrl: row.original_url || '',
      originalSource: row.original_source || '',
      featured: Boolean(row.featured),
      isActive: Boolean(row.is_active),
      socialPublishAt: row.social_publish_at || calculateDefaultSocialPublishAt(),
      socialStatus: row.social_status || 'SCHEDULED',
      socialWhatsapp: row.social_whatsapp || '',
      socialTelegram: row.social_telegram || '',
      socialTiktok: row.social_tiktok || '',
      metadata
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const POST: APIRoute = async ({ request }) => {
  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Accès non autorisé' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const { 
      type = 'job', 
      slug, 
      action, 
      isActive, 
      title, 
      excerpt, 
      description,
      heroImage, 
      requirements, 
      howToApply,
      company,
      location,
      contractType,
      opportunityType,
      category,
      domain,
      salary,
      deadline,
      publishedDate,
      originalUrl,
      originalSource,
      featured,
      // Champs spécifiques idées
      sector,
      zoneCible,
      demarrageLevel,
      besoinIdentifie,
      concept,
      publicCible,
      competencesCles,
      premiereAction,
      // Champs réseaux sociaux
      socialPublishAt, 
      socialStatus, 
      socialWhatsapp, 
      socialTelegram, 
      socialTiktok 
    } = body;

    // Action Création de bout en bout (Job ou Idea)
    if (action === 'create') {
      if (!title || String(title).trim().length === 0) {
        return new Response(JSON.stringify({ error: 'Le titre (title) est requis pour créer une opportunité' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const cleanTitle = String(title).trim();
      const rawHashSource = `${cleanTitle}-${company || sector || ''}-${Date.now()}`;
      const contentHash = crypto.createHash('sha256').update(rawHashSource).digest('hex');
      const finalSlug = (slug && String(slug).trim())
        ? slugify(String(slug).trim())
        : `${slugify(cleanTitle)}-${contentHash.slice(0, 6)}`;

      if (type === 'idea') {
        const ideaConcept = (concept || excerpt || description || cleanTitle).trim();
        const ideaBesoin = (besoinIdentifie || description || ideaConcept).trim();
        const ideaAction = (premiereAction || howToApply || 'Tester le service localement sous 48h').trim();
        const ideaSector = (sector || category || 'Services & Commerce').trim();
        const ideaZone = (zoneCible || location || 'Bamako, Mali').trim();
        const ideaLevel = (demarrageLevel || contractType || 'Très faible') as any;
        const ideaPublic = (publicCible || domain || 'Particuliers et PME locales').trim();
        const rawComp = competencesCles || requirements || [];
        const compArray = Array.isArray(rawComp)
          ? rawComp
          : typeof rawComp === 'string'
            ? rawComp.split('\n').map((s: string) => s.trim()).filter(Boolean)
            : [];

        const metaObj: Record<string, any> = { ...(body.metadata || {}) };
        if (heroImage) metaObj.heroImage = heroImage;

        const ok = await insertIdea({
          slug: finalSlug,
          title: cleanTitle,
          sector: ideaSector,
          zoneCible: ideaZone,
          demarrageLevel: ideaLevel,
          besoinIdentifie: ideaBesoin,
          concept: ideaConcept,
          publicCible: ideaPublic,
          competencesCles: compArray,
          premiereAction: ideaAction,
          contentHash,
          metadata: metaObj,
          socialPublishAt,
          socialStatus: socialStatus || 'SCHEDULED',
          socialWhatsapp,
          socialTelegram,
          socialTiktok
        });

        if (!ok) {
          throw new Error("Échec de l'insertion de l'idée en base de données");
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Idée business créée avec succès',
          slug: finalSlug,
          url: `https://job.malihub.digital/idees/${finalSlug}`,
          data: { slug: finalSlug, title: cleanTitle, type: 'idea' }
        }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Création d'une offre / opportunité (table jobs)
      const jobCompany = (company || 'Organisme Partenaire').trim();
      const jobLocation = (location || 'Bamako, Mali').trim();
      const jobContract = (contractType || 'Autre').trim();
      const jobOppType = (opportunityType || (jobContract.toLowerCase().includes('stage') ? 'STAGE' : 'JOB')).trim().toUpperCase();
      const jobCategory = (category || 'Général').trim();
      const jobExcerpt = (excerpt || (description ? String(description).slice(0, 240) : cleanTitle)).trim();
      const jobDescription = (description || jobExcerpt).trim();
      const jobPubDate = publishedDate || new Date().toISOString().slice(0, 10);
      const reqArray = Array.isArray(requirements)
        ? requirements
        : typeof requirements === 'string'
          ? requirements.split('\n').map((s: string) => s.trim()).filter(Boolean)
          : [];

      let ogImageUrl = `/images/og/${finalSlug}.webp`;
      try {
        ogImageUrl = await generateJobOgImage({
          title: cleanTitle,
          company: jobCompany,
          category: jobCategory,
          location: jobLocation,
          opportunityType: jobOppType,
          slug: finalSlug
        });
      } catch (_) {}

      const metaObj: Record<string, any> = {
        ...(body.metadata || {}),
        ogImageUrl
      };
      if (heroImage) metaObj.heroImage = heroImage;

      const generatedSocial = generateSocialTexts({
        title: cleanTitle,
        company: jobCompany,
        location: jobLocation,
        contractType: jobContract,
        slug: finalSlug,
        deadline: deadline || null,
        isIdea: false
      });

      const finalSocialPublishAt = socialPublishAt || calculateDefaultSocialPublishAt(jobPubDate);
      const finalActive = isActive !== undefined ? Boolean(isActive) : true;

      await queryDb(`
        INSERT INTO jobs (
          slug, title, company, location, contract_type, opportunity_type, category, domain,
          salary, deadline, published_date, featured, excerpt, description,
          original_url, original_source, how_to_apply,
          requirements, metadata, content_hash, is_active,
          social_publish_at, social_status, social_whatsapp, social_telegram, social_tiktok
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15, $16, $17,
          $18, $19, $20, $21,
          $22, $23, $24, $25, $26
        )
      `, [
        finalSlug,
        cleanTitle,
        jobCompany,
        jobLocation,
        jobContract,
        jobOppType,
        jobCategory,
        domain || null,
        salary || null,
        deadline || null,
        jobPubDate,
        Boolean(featured),
        jobExcerpt,
        jobDescription,
        originalUrl || null,
        originalSource || 'Mali Job',
        howToApply || null,
        JSON.stringify(reqArray),
        JSON.stringify(metaObj),
        contentHash,
        finalActive,
        finalSocialPublishAt,
        socialStatus || 'SCHEDULED',
        socialWhatsapp || generatedSocial.whatsapp,
        socialTelegram || generatedSocial.telegram,
        socialTiktok || generatedSocial.tiktok
      ]);

      return new Response(JSON.stringify({
        success: true,
        message: 'Opportunité créée avec succès',
        slug: finalSlug,
        url: `https://job.malihub.digital/opportunites/${finalSlug}`,
        data: {
          slug: finalSlug,
          title: cleanTitle,
          company: jobCompany,
          location: jobLocation,
          contractType: jobContract,
          opportunityType: jobOppType,
          category: jobCategory,
          deadline: deadline || null,
          isActive: finalActive
        }
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const table = type === 'idea' ? 'ideas' : 'jobs';

    // Action 1-clic : bascule de publication
    if (action === 'toggle-publish') {
      const newActive = Boolean(isActive);
      const newStatus = newActive ? 'SCHEDULED' : 'PAUSED';
      await queryDb(
        `UPDATE ${table} SET is_active = $1, social_status = $2, updated_at = NOW() WHERE slug = $3`,
        [newActive, newStatus, slug]
      );
      return new Response(JSON.stringify({ success: true, isActive: newActive, socialStatus: newStatus }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Récupérer la ligne existante pour mettre à jour son json metadata
    const existingRes = await queryDb(`SELECT metadata FROM ${table} WHERE slug = $1`, [slug]);
    if (existingRes.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Opportunité introuvable' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    let currentMetadata: Record<string, any> = {};
    const rawMeta = existingRes.rows[0].metadata;
    currentMetadata = typeof rawMeta === 'string' ? JSON.parse(rawMeta || '{}') : (rawMeta || {});

    // Si une image heroImage est fournie, la sauvegarder dans metadata
    if (heroImage !== undefined) {
      if (heroImage) {
        currentMetadata.heroImage = heroImage;
      } else {
        delete currentMetadata.heroImage;
      }
    }

    // Construction dynamique de la requête UPDATE
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];

    if (isActive !== undefined) {
      params.push(Boolean(isActive));
      sets.push(`is_active = $${params.length}`);
    }
    if (socialPublishAt !== undefined) {
      params.push(socialPublishAt || null);
      sets.push(`social_publish_at = $${params.length}`);
    }
    if (socialStatus !== undefined) {
      params.push(socialStatus || 'SCHEDULED');
      sets.push(`social_status = $${params.length}`);
    }
    if (socialWhatsapp !== undefined) {
      params.push(socialWhatsapp || '');
      sets.push(`social_whatsapp = $${params.length}`);
    }
    if (socialTelegram !== undefined) {
      params.push(socialTelegram || '');
      sets.push(`social_telegram = $${params.length}`);
    }
    if (socialTiktok !== undefined) {
      params.push(socialTiktok || '');
      sets.push(`social_tiktok = $${params.length}`);
    }

    // Champs de contenu éditables
    if (title !== undefined && String(title).trim().length > 0) {
      params.push(String(title).trim());
      sets.push(`title = $${params.length}`);
    }

    if (type === 'idea') {
      if (excerpt !== undefined || concept !== undefined) {
        params.push(String(concept !== undefined ? concept : excerpt).trim());
        sets.push(`concept = $${params.length}`);
      }
      if (description !== undefined || besoinIdentifie !== undefined) {
        params.push(String(besoinIdentifie !== undefined ? besoinIdentifie : description).trim());
        sets.push(`besoin_identifie = $${params.length}`);
      }
      if (howToApply !== undefined || premiereAction !== undefined) {
        params.push(String(premiereAction !== undefined ? premiereAction : howToApply).trim());
        sets.push(`premiere_action = $${params.length}`);
      }
      if (sector !== undefined || category !== undefined) {
        params.push(String(sector !== undefined ? sector : category).trim());
        sets.push(`sector = $${params.length}`);
      }
      if (zoneCible !== undefined || location !== undefined) {
        params.push(String(zoneCible !== undefined ? zoneCible : location).trim());
        sets.push(`zone_cible = $${params.length}`);
      }
      if (demarrageLevel !== undefined || contractType !== undefined) {
        params.push(String(demarrageLevel !== undefined ? demarrageLevel : contractType).trim());
        sets.push(`demarrage_level = $${params.length}`);
      }
      if (publicCible !== undefined || domain !== undefined) {
        params.push(String(publicCible !== undefined ? publicCible : domain).trim());
        sets.push(`public_cible = $${params.length}`);
      }
      if (competencesCles !== undefined || requirements !== undefined) {
        const rawComp = competencesCles !== undefined ? competencesCles : requirements;
        const compArray = Array.isArray(rawComp)
          ? rawComp
          : typeof rawComp === 'string'
            ? rawComp.split('\n').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
            : [];
        params.push(JSON.stringify(compArray));
        sets.push(`competences_cles = $${params.length}`);
      }
    } else {
      if (excerpt !== undefined) {
        params.push(String(excerpt).trim());
        sets.push(`excerpt = $${params.length}`);
      }
      if (description !== undefined) {
        params.push(String(description).trim());
        sets.push(`description = $${params.length}`);
      }
      if (howToApply !== undefined) {
        params.push(String(howToApply).trim());
        sets.push(`how_to_apply = $${params.length}`);
      }
      if (company !== undefined) {
        params.push(String(company).trim());
        sets.push(`company = $${params.length}`);
      }
      if (location !== undefined) {
        params.push(String(location).trim());
        sets.push(`location = $${params.length}`);
      }
      if (contractType !== undefined) {
        params.push(String(contractType).trim());
        sets.push(`contract_type = $${params.length}`);
      }
      if (opportunityType !== undefined) {
        params.push(String(opportunityType).trim().toUpperCase());
        sets.push(`opportunity_type = $${params.length}`);
      }
      if (category !== undefined) {
        params.push(String(category).trim());
        sets.push(`category = $${params.length}`);
      }
      if (domain !== undefined) {
        params.push(domain ? String(domain).trim() : null);
        sets.push(`domain = $${params.length}`);
      }
      if (salary !== undefined) {
        params.push(salary ? String(salary).trim() : null);
        sets.push(`salary = $${params.length}`);
      }
      if (deadline !== undefined) {
        params.push(deadline ? String(deadline).trim() : null);
        sets.push(`deadline = $${params.length}`);
      }
      if (publishedDate !== undefined) {
        params.push(String(publishedDate).trim());
        sets.push(`published_date = $${params.length}`);
      }
      if (originalUrl !== undefined) {
        params.push(originalUrl ? String(originalUrl).trim() : null);
        sets.push(`original_url = $${params.length}`);
      }
      if (originalSource !== undefined) {
        params.push(String(originalSource).trim());
        sets.push(`original_source = $${params.length}`);
      }
      if (featured !== undefined) {
        params.push(Boolean(featured));
        sets.push(`featured = $${params.length}`);
      }
      if (requirements !== undefined) {
        const reqArray = Array.isArray(requirements) 
          ? requirements 
          : typeof requirements === 'string' 
            ? requirements.split('\n').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
            : [];
        params.push(JSON.stringify(reqArray));
        sets.push(`requirements = $${params.length}`);
      }
    }

    // Metadata JSON
    params.push(JSON.stringify(currentMetadata));
    sets.push(`metadata = $${params.length}`);

    // Paramètre WHERE slug = $N
    params.push(slug);
    const slugParamIndex = params.length;

    await queryDb(`
      UPDATE ${table} SET
        ${sets.join(', ')}
      WHERE slug = $${slugParamIndex}
    `, params);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Opportunité mise à jour avec succès',
      slug,
      url: `https://job.malihub.digital/${type === 'idea' ? 'idees' : 'opportunites'}/${slug}`,
      data: {
        title,
        excerpt,
        description,
        company,
        location,
        deadline,
        heroImage: currentMetadata.heroImage || null,
        howToApply
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Erreur serveur' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
