# 3.0.0-finalisation.1 · qualification locale

- Comptes de liquidités multi-devises, taux datés, transferts avec bordereau et agrégation en XOF.
- Équilibrage de deux SGI avec plusieurs comptes et filtre de comptes.
- Justificatifs contrôlés, refus des écritures projetées et séparation comptable frais / impôts.
- Filtre sur pièces personnelles datées, journal paginé et fermeture clavier du menu.
- Actualisation opt-in d’un flux autorisé, validation du même contenu que celui préparé pour un hébergement privé et cache PWA limité au chemin d’installation.
- Vérification arithmétique indépendante par modèle Decimal et configuration E2E de la CI.

# 3.0.0-rc.3

- Refus des dates de cotation futures à l’import, à la validation du coffre et au rafraîchissement.
- Rejeu des corrections d’avis et de dividendes liés. Correction d’ouverture sur relevé, pièces archivées et éligibilité des droits par détention et ratio.
- Valorisation historique sur une séance documentée. Conservation des anciennes observations en archive.
- Proposition de protéger les données avant l’import. Reprise du ménage de l’ancienne copie V2 après authentification.
- Un seul parseur de marché actif et script de préparation hors Git pour un site privé autorisé.
- Tests du shell, du manifest, de la CSP et du cache de service worker. Mise à jour RC2 → RC3 exercée en Chromium.

## 3.0.0-import-prive.1

- Installation vierge et stockage isolé par origine et dossier. Reprise volontaire des anciens stockages.
- Import JSON prévisualisé, confirmation avec chiffrement des données actives et du point précédent, détection des réimportations et fusion conservatrice.
- Effacement confirmé du coffre, des données actives et du point précédent, synchronisé entre onglets. Export chiffré avec restauration sur une autre installation.
- Investissement organisé par étapes et confirmation séparée du projet. Date de récupération distincte de la séance de marché.
- Fiches de conformité avec méthode, justification et statut de revue indépendante documentée. Blocage des souscriptions de FCP si le dossier manque.
- Audits automatiques des sources, de l’historique et du build. Recette synthétique de l’isolation, du réseau, du chiffrement et de la restauration.

## 3.0.0-qualification.1

- Import manuel de cotations CSV ou JSON et refus des contradictions de séance. Le flux d’hébergement reste désactivé dans le build distribuable.
- Souscription FCP subordonnée à un dossier de mandat et à une VL sourcée, cohérente avec la date de l’exécution.
- Date d’ouverture des comptes et protection contre le crédit rétroactif, les positions répétées et les séries historiques fabriquées.
- Analyse étendue aux instruments du portefeuille et champ de chiffre d’affaires. Contrôles tactiles agrandis.
- Vérification du cache en absence de réseau simulée, des pièces après sauvegarde et de l’intégrité des icônes, et restriction des jobs CI au dépôt privé.
