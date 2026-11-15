# Guide Opérationnel : Tracking Umami & Campagne Influenceurs (Concours Mali Job)

> **Destinataires** : Équipe Communication, Partenariats & Marketing Mali Job  
> **Objectif** : Mesurer précisément le trafic et les conversions générés par chaque influenceur et canal de diffusion pour le **Grand Concours d'Innovation**.

---

## 1. Pourquoi ce dispositif ?

Lorsqu'un créateur de contenu ou un partenaire (ex : *Baara Sorosira*) diffuse un simple lien vers `https://malijob.ml`, nous ne pouvons pas distinguer ses visiteurs de ceux venant de Google ou d'un partage direct entre amis.

En lui fournissant un **lien tagué (paramètres UTM)** :
1. **Mesure du volume** : Nous savons exactement combien de personnes chaque influenceur amène sur le site.
2. **Mesure de l'impact réel (Conversions)** : Nous savons quel influenceur génère le plus d'inscriptions dans nos groupes **WhatsApp** et **Telegram**.
3. **Optimisation des collaborations** : Nous identifions les relais les plus engagés pour nos futures campagnes.

---

## 2. La règle de construction des liens (Nomenclature)

Chaque lien se compose de l'URL du site suivie de 3 paramètres :

```text
https://malijob.ml/?utm_source=[NOM-INFLUENCEUR]&utm_medium=influencer&utm_campaign=concours-innovation
```

| Paramètre | Description | Règle d'or | Exemple |
| :--- | :--- | :--- | :--- |
| **`utm_source`** | Qui diffuse ? | Nom en minuscules, tirets à la place des espaces, sans accents. | `baara-sorosira`, `mali-buzz`, `apej` |
| **`utm_medium`** | Par quel canal ? | `influencer` pour un créateur, ou `partenaire` pour une institution. | `influencer` |
| **`utm_campaign`** | Quel événement ? | Toujours identique pour toute la campagne. | `concours-innovation` |

---

## 3. Liens prêts à distribuer

### A. Cas concret : Baara Sorosira
* **Lien standard (Bio TikTok / Instagram / YouTube / Facebook)** :  
  `https://malijob.ml/?utm_source=baara-sorosira&utm_medium=influencer&utm_campaign=concours-innovation`
* **Si diffusion dans sa communauté WhatsApp** :  
  `https://malijob.ml/?utm_source=baara-sorosira&utm_medium=whatsapp-community&utm_campaign=concours-innovation`

---

### B. Modèle pour les autres influenceurs
Pour tout nouvel influenceur (ex: *Kassoum Diarra*), il suffit de remplacer la source :  
`https://malijob.ml/?utm_source=kassoum-diarra&utm_medium=influencer&utm_campaign=concours-innovation`

---

### C. Liens pour nos partenaires institutionnels & terrain
* **Canaux officiels APEJ** :  
  `https://malijob.ml/?utm_source=apej-officiel&utm_medium=partenaire&utm_campaign=concours-innovation`
* **Espaces Orientation Jeunesse (EOJ)** :  
  `https://malijob.ml/?utm_source=eoj-mali&utm_medium=partenaire&utm_campaign=concours-innovation`
* **QR Codes sur affiches / flyers physiques** :  
  `https://malijob.ml/?utm_source=affiche-terrain&utm_medium=print&utm_campaign=concours-innovation`

---

## 4. Ce que nous suivons dans Umami (`stats.malihub.digital`)

Le site Mali Job enregistre automatiquement les actions clés des visiteurs :

### Événements suivis :
1. `join-community-whatsapp` : Clic pour rejoindre le groupe WhatsApp communautaire.
2. `join-community-telegram` : Clic pour rejoindre le canal Telegram.
3. `submit-contest-video-whatsapp` : Envoi effectif de la vidéo au jury WhatsApp.
4. `click-sponsor-contact` : Clic des entreprises / diaspora souhaitant sponsoriser un prix.

---

## 5. Comment consulter les résultats dans Umami ?

1. Rendez-vous sur votre instance Umami : **`https://stats.malihub.digital`**.
2. Sélectionnez le site **Mali Job**.
3. Dans la colonne des métriques :
   - Cliquez sur l'onglet **« UTM »** ou **« Sources »** : vous verrez le classement des influenceurs en nombre de visiteurs.
   - Cliquez sur **« Événements »** : vous visualisez en direct le nombre d'adhésions WhatsApp générées.
   - Pour voir les résultats d'un influenceur particulier : cliquez sur son nom dans les UTM ; tout le tableau de bord s'actualise pour n'afficher que ses métriques et conversions.
