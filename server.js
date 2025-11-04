// Access Package Resource Finder - Server
// Runs on Azure App Service with Managed Identity

const express = require('express');
const { DefaultAzureCredential, ManagedIdentityCredential } = require('@azure/identity');
const { Client } = require('@microsoft/microsoft-graph-client');
const { TokenCredentialAuthenticationProvider } = require('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials');

const app = express();
const port = process.env.PORT || 3000;

// Serve static files
app.use(express.static('public'));
app.use(express.json());

// Initialize Graph client with Managed Identity
function getGraphClient() {
    // Use ManagedIdentityCredential when running in Azure
    // Use DefaultAzureCredential for local development (falls back to Azure CLI, VS Code, etc.)
    const credential = process.env.WEBSITE_INSTANCE_ID 
        ? new ManagedIdentityCredential()  // Running in Azure App Service
        : new DefaultAzureCredential();    // Running locally
    
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
        scopes: ['https://graph.microsoft.com/.default']
    });

    return Client.initWithMiddleware({
        authProvider: authProvider
    });
}

// API endpoint to search for resources in access packages
app.post('/api/search', async (req, res) => {
    try {
        const { searchType, searchValue } = req.body;

        if (!searchType || !searchValue) {
            return res.status(400).json({ error: 'Missing searchType or searchValue' });
        }

        console.log(`Searching for ${searchType}: ${searchValue}`);

        const graphClient = getGraphClient();
        const results = [];

        // Get all access packages (just IDs and names first)
        const accessPackagesResponse = await graphClient
            .api('/identityGovernance/entitlementManagement/accessPackages')
            .select('id,displayName')
            .get();

        console.log(`Found ${accessPackagesResponse.value.length} access packages`);

        // For each access package, get full details with resource role scopes
        for (const pkg of accessPackagesResponse.value) {
            try {
                // Get the specific access package with expanded resource role scopes
                // Using query parameter format that works with REST API
                const packageDetails = await graphClient
                    .api(`/identityGovernance/entitlementManagement/accessPackages/${pkg.id}`)
                    .query({ '$expand': 'resourceRoleScopes($expand=role,scope)' })
                    .get();

                if (!packageDetails.resourceRoleScopes || packageDetails.resourceRoleScopes.length === 0) {
                    continue;
                }

                // Search through resource role scopes
                for (const roleScope of packageDetails.resourceRoleScopes) {
                    const scope = roleScope.scope;
                    const role = roleScope.role;
                    let isMatch = false;

                    switch (searchType) {
                        case 'application':
                            // Match by Application Object ID (originId) and ensure it's an AadApplication
                            if (scope && scope.originId === searchValue && scope.originSystem === 'AadApplication') {
                                isMatch = true;
                            }
                            break;

                        case 'group':
                            // Match by Group Object ID
                            if (scope && scope.originId === searchValue && scope.originSystem === 'AadGroup') {
                                isMatch = true;
                            }
                            break;

                        case 'sharepoint':
                            // Match by SharePoint site URL
                            if (scope && scope.originId === searchValue && scope.originSystem === 'SharePointOnline') {
                                isMatch = true;
                            }
                            break;

                        default:
                            break;
                    }

                    if (isMatch) {
                        results.push({
                            accessPackageName: packageDetails.displayName,
                            accessPackageId: packageDetails.id,
                            resourceName: scope.displayName || 'N/A',
                            resourceType: scope.originSystem,
                            resourceId: scope.originId,
                            roleName: role?.displayName || 'N/A'
                        });
                    }
                }
            } catch (pkgError) {
                console.error(`Error processing access package ${pkg.id}:`, pkgError.message);
                // Continue with next package
            }
        }

        console.log(`Found ${results.length} matches`);
        res.json({ results, searchType, searchValue });

    } catch (error) {
        console.error('Error searching access packages:', error);
        res.status(500).json({ 
            error: 'Failed to search access packages', 
            details: error.message 
        });
    }
});

// API endpoint to resolve Group name to Object ID
app.post('/api/resolveGroup', async (req, res) => {
    try {
        const { groupName } = req.body;

        if (!groupName) {
            return res.status(400).json({ error: 'Missing groupName' });
        }

        console.log(`Resolving group: ${groupName}`);

        const graphClient = getGraphClient();
        
        // Search for the group by display name
        const groups = await graphClient
            .api('/groups')
            .filter(`displayName eq '${groupName}'`)
            .select('id,displayName')
            .get();

        if (groups.value.length === 0) {
            return res.status(404).json({ error: 'Group not found' });
        }

        res.json({ 
            groupId: groups.value[0].id,
            displayName: groups.value[0].displayName 
        });

    } catch (error) {
        console.error('Error resolving group:', error);
        res.status(500).json({ 
            error: 'Failed to resolve group', 
            details: error.message 
        });
    }
});

// API endpoint to resolve Application name to Service Principal Object ID
app.post('/api/resolveApplication', async (req, res) => {
    try {
        const { applicationName } = req.body;

        if (!applicationName) {
            return res.status(400).json({ error: 'Missing applicationName' });
        }

        console.log(`Resolving application: ${applicationName}`);

        const graphClient = getGraphClient();
        
        // Search for the service principal by display name (supports partial matching)
        const servicePrincipals = await graphClient
            .api('/servicePrincipals')
            .filter(`startswith(displayName, '${applicationName}')`)
            .select('id,displayName,appId')
            .get();

        if (servicePrincipals.value.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }

        // Return all matches for user selection if multiple found
        const applications = servicePrincipals.value.map(sp => ({
            objectId: sp.id,
            displayName: sp.displayName,
            appId: sp.appId
        }));

        // If single match, return it directly; if multiple, return array for selection
        if (applications.length === 1) {
            res.json(applications[0]);
        } else {
            res.json({ 
                multiple: true, 
                applications: applications 
            });
        }

    } catch (error) {
        console.error('Error resolving application:', error);
        res.status(500).json({ 
            error: 'Failed to resolve application', 
            details: error.message 
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        environment: process.env.WEBSITE_INSTANCE_ID ? 'Azure App Service' : 'Local Development' 
    });
});

// Start server
app.listen(port, () => {
    console.log(`Access Package Resource Finder running on port ${port}`);
    console.log(`Environment: ${process.env.WEBSITE_INSTANCE_ID ? 'Azure App Service' : 'Local Development'}`);
});
