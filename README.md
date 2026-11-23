# BRVM Family V3.4 — GitHub Pages et APK Android

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
- Sauvegarde JSON mensuelle obligatoire et import privé conservés.

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

## Sauvegarde mensuelle obligatoire
- Dès la première session avec comptes du nouveau mois civil, l'application exige une sauvegarde privée avant toute nouvelle modification financière.
- L'action **Sauvegarde mensuelle JSON** produit localement un ZIP nommé `BRVM_SAUVEGARDE_AAAA-MM.zip` comprenant `BRVM_COMPLET.json`, un JSON indépendant pour chaque compte actif et `MANIFESTE.json`.
- Pour attester la sauvegarde, l'utilisateur **resélectionne le fichier ZIP qu'il vient de télécharger** : l'application vérifie sa taille et son empreinte SHA-256 avant d'enregistrer la validation du mois dans le coffre local.
- Tant que la sauvegarde n'est pas validée, consultation, imports de récupération, export et effacement volontaire restent disponibles. Les écritures, réglages et mises à jour de cotations sont bloqués.
- L'importeur accepte les JSON individuels ou le ZIP mensuel complet, sans extraction manuelle. Une restauration sur un autre appareil exige une nouvelle sauvegarde locale.
- **Sécurité** : le ZIP contient des JSON lisibles en clair. Ne jamais l'ajouter à GitHub, à une issue, à une release ou à un espace partagé. Le placer dans un stockage privé et protégé, de préférence hors de l'appareil. Partager uniquement les JSON strictement nécessaires.
- Les fichiers individuels sont des **photographies comptables** (positions, cash et historique archivé), destinées au transfert des comptes. Le JSON complet préserve en plus le journal actif et les observations de performance.
- Une application web ne peut pas prouver qu'un téléchargement est durablement conservé à l'extérieur de l'appareil. La relecture de l'archive atteste seulement que des octets identiques sont accessibles au moment de la vérification.

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
