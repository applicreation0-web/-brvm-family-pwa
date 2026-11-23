# BRVM Family V3.2 — GitHub Pages et APK Android

PWA indépendante, hébergée directement sur GitHub Pages. Aucun hébergement Vercel ou constructeur d'applications n'est nécessaire.

## Installer
Une fois la publication GitHub Pages activée et les tests réussis :
`https://applicreation0-web.github.io/-brvm-family-pwa/`

Sur Android, ouvrir l'adresse dans Chrome puis installer l'application depuis le menu du navigateur.

## Icône Android et PWA V3.3.1
Le pictogramme original bleu nuit, or et vert d’eau représente le patrimoine et sa progression. Le même dessin vectoriel génère les PNG 192 et 512 px pendant les compilations sécurisées (application web + Android) ; aucune image personnelle et aucune clé de signature dans le dépôt. Les nouveaux fichiers remplacent l'icône de lancement via une mise à jour signée avec l'ancienne clé privée.

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
