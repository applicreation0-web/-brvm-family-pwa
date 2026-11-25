# BRVM Family V3.6.6 — lecture automatique des cours (retour du fonctionnement Vercel)
- Diagnostic : la Vercel `brvm-family-v3` utilisait l'URL directe `https://brvmdata.com/telechargements/actions-derniere-seance.csv` dans `quotes.js`, mais son `market/feed.json` était aussi désactivé. Le blocage actuel dans GitHub Pages provenait de l'importeur réseau interne désactivé ET de la CSP `connect-src 'self'`.
- Rétablissement d'un téléchargement CSV **direct de chaque navigateur vers le fournisseur** ; seul `brvmdata.com` est autorisé par la CSP, via GET CORS anonyme. Aucune donnée personnelle, identité, position, JSON, clé ou solde n'est envoyée, mise sur GitHub ou sur un serveur intermédiaire. Si un flux titulaire de droits est ultérieurement configuré, il garde la priorité.
- Actualisation en ouvrant la PWA (coffre déverrouillé), toutes les 15 minutes pendant l'utilisation si en ligne, au retour de connectivité et avant de calculer les scénarios d'achat ; le réglage peut désactiver cette actualisation. Un manuel « Actualiser directement » reste disponible.
- Le CSV est normalisé avec date exacte de séance et provenance, conservé en qualité `provisional` et jamais présenté comme temps réel ou une cotation officielle vérifiée. Le contrôle de fraîcheur des scénarios d'achats demeure strict. Si le fournisseur est lent, refuse CORS, répond 503 ou publie en retard, garder les anciennes cotations datées, afficher l'échec, proposer le CSV manuel et le contrôle BRVM officiel. Ni espèces, ni opérations, ni quantités ne changent durant un rafraîchissement.
- Contrôles supplémentaires : tests de contrat, navigateur CORS simulé, confidentialité de requêtes, et diagnostic réel CORS fournisseur sans collecte de données privées.
- L'accès gratuit du fournisseur ne signifie pas licence de redistribution : pas d'hébergement ni publication de son CSV sur GitHub Pages.

# BRVM Family V3.6.5 — Acheter avec scénarios de trésorerie par SGI
- Bouton **Acheter** : choix du compte/SGI, montant total que l'utilisateur accepte d'investir, méthode **cours limite** ou **au marché**. Le moteur propose trois scénarios (50 %, 75 % et 100 % du budget) à partir des espèces réellement disponibles et des cibles CORE du portefeuille.
- Frais estimatifs par compte, quantités entières, cours de référence, espèces restantes et budget non investi visibles par scénario. Le total proposé inclut les frais paramétrés et reste toujours inférieur au budget et au cash disponible. Taxes ou frais supplémentaires non connus = à vérifier au courtier.
- À cours limite, l'utilisateur peut créer des **projets** (pas d'ordre envoyé, aucune trésorerie débitée), puis saisir **uniquement les opérations réellement exécutées sur avis** ; le budget libre et les cibles sont recalculés après chaque nouvelle écriture. L'ordre au marché est une **simulation sans garantie de total** : aucun projet plafonné ne peut être créé dans ce mode.
- Protection : les suggestions demandent un cours du jour ou de la dernière séance ouvrée (date/source affichées). Les cours antérieurs ne déclenchent pas de recommandation ; lien vers la BRVM officielle. **Aucun flux de cotations automatiques sous licence n'est actuellement configuré** (`market/feed.json` désactivé) ; l'auto-refresh existant nécessite une autorisation fournisseur et une configuration réelle. Ne jamais annoncer des cours en direct fictifs.
- Aucune ligne réelle de compte ni JSON privé dans GitHub. Les exports du 24 novembre provenaient d'une base historique incomplète : vérifier les soldes sur avis SGI avant d'investir et ne jamais corriger un compte automatiquement sans justificatif.

# BRVM Family V3.6.4 — opérations libres, confirmations et retrait sûr du journal
- Suppression du blocage de sauvegarde mensuelle obligatoire et de la bannière à répétition. Sauvegarde ZIP volontaire disponible en un clic et export chiffré conservé.
- Deux étapes avant comptabilisation réelle : récapitulatif détaillé, puis **Confirmer et comptabiliser**. Une modification du formulaire annule cette confirmation.
- Journal et archives : action **Retirer** avec motif et confirmation explicite. Recalcul intégral avant validation, refus des suppressions mettant les espèces, frais ou positions en incohérence, des fractionnements et écritures liées ; trace non affichée conservée dans l’audit JSON privé.
- Toutes les données financières restent locales et aucune clé de signature ni JSON réel n’est publié dans GitHub.

# BRVM Family V3.6.3 — ZIP de cinq comptes importable en une fois
- Correction de l’import : un ZIP standard (compression DEFLATE ou STORE) contenant plusieurs JSON individuels est lu, contrôlé par CRC/taille, puis fusionné en un seul portefeuille familial **après confirmation de l’utilisateur**. Les sauvegardes mensuelles historiques BRVM_COMPLET.json + MANIFESTE.json restent compatibles.
- Fractionnements : une même opération de marché (même symbole/date/ratio) peut figurer sur chaque compte sans que la fusion rejoue ni duplique les titres. Les ratios divergents, comptes dupliqués, archives corrompues et ZIP incomplets sont refusés.
- Aucun JSON privé/compte réel n’est commité dans le dépôt, les recettes se font sur cinq comptes fictifs.
- Les données existantes sont protégées : aperçu avant validation, fusion uniquement si strictement compatible, remplacement soumis à confirmation expresse. Sauvegarder toute modification locale avant restauration.
- APK Android : le build CI reste volontairement non signé dans le dépôt public. Les clés privées ne sont jamais présentes dans GitHub.

# BRVM Family V3.6.2 — audit de résistance du CORE manuel

## Contrôle qualité reproductible (GitHub Actions)
- `npm test` : tests des positions, écritures, frais, cibles, sauvegardes et exclusions.
- `tests/stress_core.test.js` : 1 200 éditions déterministes avec composition CORE de 1 à 12 actions, arrondis au centième, conservation bit-à-bit des comptes/ordres/positions/liquidités/justificatifs, deuxième portefeuille intact, validation JSON après chaque cycle.
- Attaques d'entrée : totaux 99,99/100,01 %, zéros, décimales excessives, banques, FCP, émetteur déjà exclu, doublons et alias TTLC/TOCI, chaînes malformées ou injectées, liste trop longue, propriétaire/portefeuille non autorisé.
- `tests/browser_e2e.py` : modification réelle au navigateur 360px, refus de saisies invalides, alias, export/import, sauvegarde ZIP, retours arrière, mode hors ligne, absence d'envoi des données privées, concurrence entre deux onglets avec rejet d'une révision ancienne.
- `scripts/privacy_check.py` : contrôle strict des fichiers sources et de l'archive distribuée vide.
- Application indépendante sur GitHub Pages ; compilation Android hors ligne non signée publiquement, pas d'accès aux clés privées.

## Limites non considérées comme validées par cette release
- Cette version stabilise l'interface manuelle ; ce n'est pas une certification 76/76 du mandat familial historique.
- La signature Android privée et la synchronisation réelle entre utilisateurs ne sont pas livrées.
- Les cotations BRVM ne deviennent pas automatiques faute de preuve d'autorisation de redistribution.
- Modifier un CORE ne modifie **jamais** les actifs détenus ; un achat ou une vente doit être comptabilisé séparément, avec les frais réels.

## BRVM Family V3.6.1 — tableau de bord simplifié
- Un seul accès visible « Modifier mes données et mes actions » ouvre les changements manuels : composition du CORE (symboles et poids), cours, données émetteur, fiches d'actions, JSON privé et sauvegardes.
- Les actions CORE sont personnalisables par portefeuille : 1 à 12 symboles distincts, somme des cibles 100 %, secteur bancaire exclu. La modification ne crée aucun ordre, aucune vente, aucun dépôt et ne réécrit pas les positions historiques.
- Les écrans de scores, veille et recommandations ne sont plus affichés sur l'accueil. Leur code demeure isolé : aucun dossier personnel n'est transmis.
- Les opérations essentielles (acheter, vendre, verser, dividendes, événements, sauvegarde) restent accessibles.
- Remplacer une action dans le CORE ne vend pas les anciennes actions détenues. Les opérations réelles restent explicitement confirmées, frais à l'appui.

# BRVM Family V3.6 — GitHub Pages et APK Android

PWA indépendante, hébergée directement sur GitHub Pages. Aucun hébergement Vercel ou constructeur d'applications n'est nécessaire.


## Veille documentaire autonome — sources officielles publiques
- Un workflow GitHub Actions `.github/workflows/public-watch.yml` vérifie les pages publiques BRVM en semaine, copie uniquement les intitulés brefs et liens des communiqués, avis de dividendes et fractionnements, puis actualise `market/public-watch.json` dans le dépôt.
- La PWA récupère uniquement ce fichier public sur son propre domaine, sans envoyer d'informations sur les comptes ou le portefeuille. Une source indisponible ou un document non vérifiable n'est jamais traité comme une information certifiée.
- **La veille documentaire ne remplace ni les cotations autorisées, ni l'analyse complète des états financiers** : le barème CORE repose toujours sur les dossiers de sélection justifiés et disponibles localement. Le flux de prix commercial demeure désactivé.
- Le workflow n'édite jamais de portefeuille et ne transmet aucune donnée financière privée.

## Qualification CORE automatisée — évolution en cours de recette
Le module `review.js` évalue automatiquement les sept valeurs CORE et les autres actions explicitement documentées dans le catalogue local `instruments`. **Un cours seul ne suffit pas à attribuer une note.** La veille planifiée recherche indépendamment des faits publics et des candidats hors CORE ; elle n'est pas encore synchronisée automatiquement avec le navigateur.

### Exclusion et contrôle de provenance avant tout score
- Exclure les activités prohibées : banques à intérêt et finance/assurance conventionnelle, alcool, tabac et jeux ; une activité non qualifiée est « données insuffisantes », jamais « conforme ».
- Vérifier, lorsque les comptes publiés permettent la ventilation : dette portant intérêt / actifs <=33 %, actifs portant intérêt / actifs <=33 %, revenus non conformes / chiffre d'affaires <5 %. Ce sont des seuils de prudence choisis pour cette stratégie, pas une certification religieuse.
- Refuser une entrée si des ratios ne sont pas calculables, si les documents sont périmés, si la cote est suspendue ou si un signal de gouvernance majeur est non résolu.
- Exiger sept références datées par émetteur (filtrage, finances, valorisation, dividendes, liquidité, prix et gouvernance), et un rapport annuel audité daté de moins de 18 mois. La simple présence d'une URL ne garantit pas son exactitude : recouper avec le document source.

### Barème, 100 points
- **Solidité 30** : bénéfice net positif >=2 des 3 derniers exercices (10), CA final supérieur au premier sur 3 exercices (10), dette nette / EBITDA <=2,5 (10).
- **Valorisation 20** : PER positif et <=médiane sectorielle (10 ; 5 si jusqu'à 1,25×), EV/EBITDA <=médiane sectorielle (10 ; 5 si jusqu'à 1,25×).
- **Dividendes 15** : versés >=2 des 3 derniers exercices (10), rendement net >0 et distribution <=80 % (5).
- **Liquidité 15** : négocié sur >=70 % des 60 séances (10), médiane quotidienne des transactions >=5 M FCFA (5 ; 3 si >=1 M).
- **Tendance 10** : évolution du cours ajusté des fractionnements sur 6 mois supérieure/égale à celle de l'indice BRVM Composite (10 ; 5 à moins de 5 points).
- **Publication/gouvernance 10** : états annuels audités récents (5), absence de signal majeur et de suspension (5).

**Décision :** score complet >=75 : candidat ou conserver ; 55–74 : surveiller ; <55 : réexaminer. Un candidat hors CORE doit atteindre 75 et dépasser un sortant de 10 points pour apparaître dans les propositions. Le système propose, mais ne modifie jamais les cibles, ne touche pas aux comptes et n'émet aucun ordre. Des statistiques ou justificatifs manquants signifient `score=null` et un statut non classable, jamais zéro ou des données inventées.

### Autonomie et limite explicite
L'analyse locale se recalcule automatiquement à l'ouverture à partir du dossier documenté local, mais **ne recherche pas toute seule les cours ou rapports de l'ensemble de la cote**. Un flux commercial ou une source de redistribution nécessitant autorisation ne sera pas activé sans droits établis : `market/feed.json` reste désactivé. Les deux surveillances externes déjà programmées assurent la recherche documentaire régulière et la revue semestrielle ; leur résultat n'est pas encore importé dans la PWA. Une vraie sélection 100 % sans intervention requiert une source autorisée, une ingestion publique vérifiable et un transfert sécurisé de ses conclusions vers l'application.

## Installer
Une fois la publication GitHub Pages activée et les tests réussis :
`https://applicreation0-web.github.io/-brvm-family-pwa/`

Sur Android, ouvrir l'adresse dans Chrome puis installer l'application depuis le menu du navigateur.

## Icône Android et PWA V3.4 (identité V3.3.1 conservée)
Le pictogramme original bleu nuit, or et vert d’eau représente le patrimoine et sa progression. Le même dessin vectoriel génère les PNG 192 et 512 px pendant les compilations sécurisées (application web + Android) ; aucune image personnelle et aucune clé de signature dans le dépôt. Les nouveaux fichiers remplacent l'icône de lancement via une mise à jour signée avec l'ancienne clé privée.

## Ergonomie V3.4 — données émetteurs sur téléphone
- L'ancienne table horizontale à huit colonnes dans « Cibles et risques » est remplacée par des fiches par titre, repliées au départ et conçues pour les écrans de 360 à 390 px.
- Afficher exclusivement les ratios chiffrés déjà documentés et la source/date lorsqu'elles existent ; les titres sans ratios passent dans une liste secondaire dépliable, sans « Indisponible » répété ni valeurs financières inventées.
- Les dossiers de filtrage et les données d'émetteurs restent modifiables via les boutons de chaque fiche ; aucun titre, cash, ordre, transaction ou cible CORE n'est altéré.
- La nouvelle icône officielle bleu nuit, or et vert d'eau de la version 3.3.1 est conservée dans la PWA et l'APK 3.4.

## Ergonomie 3.3 — un seul espace Opérations
- Le menu « Opérations » regroupe Versement ponctuel, Achat exécuté, Vente exécutée, Retrait et Dividende. L'ancien écran « Ordres achat / vente » est intégré dans une section repliable du même espace ; les projets CORE sont également repliables. Les accès rapides du tableau de bord ouvrent les mêmes formulaires, jamais un module comptable concurrent.
- Versement : saisir le **montant réellement crédité** sur le compte SGI à réception de l'avis ; aucun financement fictif ni dépôt mensuel. Retrait : montant réellement débité. Transfert entre comptes : montants réels et conversion documentée.
- Frais d'achat/vente : courtage réel (contrôlé à 1 % maximum du brut), autres frais, taxes et **montant total du bordereau strictement égal** au montant reconstitué. Le débit de l'achat comprend tous les frais saisis, le crédit de la vente est net des frais saisis.
- Frais de compte indépendants : « Autres opérations → Frais du compte » avec catégorie (garde/tenue, transfert, taxe distincte, autres), montant réellement débité et référence ; évite de les compter deux fois s'ils sont déjà compris dans le montant net saisi.
- Estimations CORE : courtage et autres frais proportionnels configurés par compte, **pas** une garantie d'inclure les taxes futures ou les forfaits non configurés. Comparer ensuite l'avis réel et saisir ses composantes ; l'application ne prélève aucun frais.
- Sauvegarde JSON facultative et import privé conservés.

## Ergonomie 3.1 — cinq gestes essentiels
- **Accueil** : actions directes Acheter, Vendre, Dividende, Opérations sur titres, Sauvegarder. Camembert des actions et espèces, valeur en FCFA, pourcentages; tableau de bord CORE réel/cible; analyses détaillées repliables.
- **Achats ponctuels CORE** : les cibles sont propres à chaque portefeuille et l'algorithme ne suppose plus de versement mensuel. Seules les espèces confirmées et disponibles peuvent financer un projet d’achat. Les cours doivent être datés. Courtage et autres frais estimés par compte puis débit réel sur avis.
- **Ventes** : saisie d'exécution ou ordre manuel de vente, quantités contrôlées à la date d'opération, courtage plafonné à 1 %, autres frais/taxes et somme effectivement créditée contrôlés. Un projet n'est pas une vente exécutée; les ordres transmis immobilisent les titres disponibles pour d'autres ventes.
- **Dividendes et opérations sur titres** : encaissement net après prélèvements, fractionnements/regroupements, actions gratuites, droits, dividendes en actions et expiration de droits, sur justificatifs réels.
- **Historique** : ventes, dividendes, liquidités, gains réalisés et frais, sans simulation imposée d'apports mensuels. Les données stockées restent locales, sans transmission de transactions à une SGI.
- **Qualification** : tests financiers des parcours achat/vente et des droits, sauvegarde mensuelle et confidentialité, recette Chromium mobile sur portefeuille fictif, APK Android hors ligne et versionCode augmenté pour mise à jour avec la même signature privée.

## V3.2 — couleurs, SGI, objectifs et cours
- **Camembert filtrable** : Toutes les SGI, FGI, CGF ou autre SGI dans le portefeuille sélectionné. Le total et les pondérations du camembert et la comparaison CORE/cible suivent le filtre ; le patrimoine global demeure explicitement global.
- **Couleurs distinctes** : couleur fixe par symbole, contrastes catégoriels, traits sombres entre parts, légende avec code et pourcentage. Filtrer ne recolorie jamais un titre. Au-delà de six titres, détails accessibles d'un geste.
- **Cibles CORE validées** : Sonatel 30 %, Orange 15 %, CIE 10 %, TotalEnergies 12 %, SMB 9 %, Nestlé 15 %, Palm 9 % ; total 100 %. Les nouveaux portefeuilles héritent de ces cibles. Un portefeuille importé conservant de vieilles cibles peut les rétablir explicitement, sans changer ses positions, espèces ou ordres. Pas de réécriture silencieuse des données importées.
- **Nouvelle SGI / compte** : accès direct depuis le camembert et Comptes ; sélectionner le portefeuille et une SGI existante ou saisir une nouvelle dénomination. Espèces initiales 0, mensualité 0, aucun achat inventé. BRVM Family n'ouvre pas de compte de courtage ; évite de dupliquer une SGI existante sous le même nom.
- **Cotation BRVM** : aucun flux automatique autorisé n'est configuré dans la version distribuée (market/feed.json désactivé). Le bouton « Cours BRVM » guide vers un fichier CSV/JSON local téléchargé, et vers la vérification par le Bulletin officiel. Import contrôlé par date, qualité, provenance et doublons. Aucun cours n'est inventé.
- **Android** : version 3.2.0, versionCode 3, même package. Mettre à jour sans désinstaller exige la même clé de signature privée.
- **Qualification** : tests sur comptes strictement fictifs pour l'ergonomie, le filtre SGI (y compris compte sans titre), l'identité couleur, les cibles CORE, les opérations et les sauvegardes.

## Confidentialité
L'application distribuée est **entièrement vierge**. Aucune identité, aucun compte, aucun solde, aucun investissement ou historique personnel n'est intégré au dépôt, au build ni à GitHub Pages. Import JSON volontaire, puis coffre chiffré local sur chaque appareil. Aucun JSON privé ne doit être ajouté au dépôt, à ses issues ou à ses releases.

## Sauvegardes privées facultatives
- Le ZIP de sauvegarde mensuelle peut être téléchargé volontairement, sans obligation ni vérification bloquante.
- Une sauvegarde reste recommandée avant une modification importante ou une restauration, mais aucune action financière n’est suspendue à cause d’un mois non sauvegardé.
- Les JSON personnels et les clés privées ne sont jamais publiés dans ce dépôt.

## Publication sans tiers
Le workflow `.github/workflows/pages.yml` vérifie la confidentialité, lance les tests financiers et Chromium, construit `dist/` depuis une liste blanche puis publie exclusivement ce dossier avec GitHub Pages.

Si Pages est désactivé, ouvrir [Settings → Pages](https://github.com/applicreation0-web/-brvm-family-pwa/settings/pages), sélectionner **Source : GitHub Actions**, puis relancer le workflow.

## Limites actuelles
- Les cours de la BRVM sont importables par CSV/JSON ou saisie manuelle. Pas de flux automatique activé sans droits d'utilisation validés.
- Les comptes sur deux appareils sont aujourd'hui **des copies locales indépendantes**. Aucun login ou mot de passe familial, aucune invitation par lien, aucune lecture seule garantie, ni synchronisation automatique ne sont implémentés.
- Pour ajouter plus tard des accès familiaux synchronisés, un service de synchronisation chiffrée et une gestion des autorisations sont nécessaires, distincts de l'hébergement statique GitHub Pages.
- Le site est une préversion fonctionnelle et non une qualification officielle 76/76.

## Développement
`npm test`, `python -m unittest discover -s tests -p 'test_*.py'`, `python scripts/build.py dist`.

## Version distribuée 3.3.0
L’interface réunit désormais les versements, achats et ventes sur l’écran **Opérations**, avec le suivi des ordres et les frais distincts accessibles depuis ce même écran. Les changements ont passé les tests financiers et Chromium sur données fictives. Le rapprochement avec les avis de la SGI demeure indispensable pour les frais réels.
