# BRVM Family V3 — GitHub Pages

PWA indépendante, hébergée directement sur GitHub Pages. Aucun hébergement Vercel ou constructeur d'applications n'est nécessaire.

## Installer
Une fois la publication GitHub Pages activée et les tests réussis :
`https://applicreation0-web.github.io/-brvm-family-pwa/`

Sur Android, ouvrir l'adresse dans Chrome puis installer l'application depuis le menu du navigateur.

## Confidentialité
L'application distribuée est **entièrement vierge**. Aucune identité, aucun compte, aucun solde, aucun investissement ou historique personnel n'est intégré au dépôt, au build ni à GitHub Pages. Import JSON volontaire, puis coffre chiffré local sur chaque appareil. Aucun JSON privé ne doit être ajouté au dépôt, à ses issues ou à ses releases.

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
