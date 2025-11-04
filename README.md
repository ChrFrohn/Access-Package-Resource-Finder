# Access Package Resource Finder

A web application to search for resources across all Entra ID Access Packages. This tool helps quickly identify which Access Packages contain specific resources like Applications, Groups, or SharePoint sites.

This app is based of the PowerShell scripts found in this blog post : https://www.christianfrohn.dk/2025/05/08/finding-resources-in-microsoft-entra-id-governance-access-packages-using-powershell/

## Features

- 🔍 **Search by Application** - Find Access Packages containing a specific application (by Object ID)
- 👥 **Search by Group** - Find Access Packages containing a specific group (by name)
- 📁 **Search by SharePoint Site** - Find Access Packages containing a specific SharePoint site (by URL)
- 🔐 **Secure Authentication** - Uses Azure Managed Identity

## Prerequisites

- Azure subscription
- **Microsoft Graph PowerShell Module** (for granting permissions to Managed Identity)
- **Azure PowerShell Module** (for managing Azure resources)
- Permissions to create Azure resources and assign Microsoft Graph API permissions

## Deploy to Azure

Click the button below to deploy this application to your Azure subscription using the included ARM template:

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fyour-org%2FAccess-Package-Resource-Finder%2Fmain%2Finfra%2Fazuredeploy.json)

**Alternative**: Use Azure CLI to deploy the ARM template from the `infra/` folder (see [deployment instructions](#option-1-deploy-using-arm-template-recommended) below).

> **⚠️ Important**: After deployment, you **must** configure Managed Identity permissions. See [Post-Deployment Configuration](#post-deployment-configuration).

### Post-Deployment Configuration

After deployment, you **must** configure Microsoft Graph API permissions for the Managed Identity.

#### Step 1: Install Required PowerShell Modules

```powershell
# Install Microsoft Graph PowerShell module
Install-Module Microsoft.Graph -Scope CurrentUser

# Install Azure PowerShell module
Install-Module Az -Scope CurrentUser
```

#### Step 2: Grant Microsoft Graph Permissions to the Managed Identity

```powershell
# Connect to Azure (required to get Managed Identity details)
Connect-AzAccount

# Connect to Microsoft Graph (requires Global Administrator or Privileged Role Administrator)
Connect-MgGraph -Scopes "Application.Read.All", "AppRoleAssignment.ReadWrite.All"

# Prompt for your Web App details
$webAppName = Read-Host "Enter your Web App name"
$resourceGroup = Read-Host "Enter your Resource Group name"

# Get the Managed Identity's Object ID
$managedIdentity = Get-AzWebApp -ResourceGroupName $resourceGroup -Name $webAppName
$managedIdentityObjectId = $managedIdentity.Identity.PrincipalId

# Get Microsoft Graph Service Principal
$graphSP = Get-MgServicePrincipal -Filter "appId eq '00000003-0000-0000-c000-000000000000'"

# Assign EntitlementManagement.Read.All permission
New-MgServicePrincipalAppRoleAssignment -ServicePrincipalId $managedIdentityObjectId -BodyParameter @{
    PrincipalId = $managedIdentityObjectId
    ResourceId = $graphSP.Id
    AppRoleId = "c74fd47d-ed3c-45c3-9a9e-b8676de685d2"
}

# Assign Group.Read.All permission
New-MgServicePrincipalAppRoleAssignment -ServicePrincipalId $managedIdentityObjectId -BodyParameter @{
    PrincipalId = $managedIdentityObjectId
    ResourceId = $graphSP.Id
    AppRoleId = "5b567255-7703-4780-807c-7be8301ae99b"
}

Write-Host "Permissions assigned successfully!"
```

**Note**: Assigning Microsoft Graph permissions requires **Global Administrator** or **Privileged Role Administrator** role.
## Screen shots:

<img width="1164" height="1222" alt="image" src="https://github.com/user-attachments/assets/2fd34fb6-c6f3-49dc-b62c-bd89fbb6a248" />


## License

MIT License
