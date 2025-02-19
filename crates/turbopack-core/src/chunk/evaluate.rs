use anyhow::{bail, Result};
use turbo_tasks::{Value, ValueToString};

use super::{ChunkableModule, ChunkableModuleVc};
use crate::{
    asset::{Asset, AssetVc},
    context::{AssetContext, AssetContextVc},
    module::{Module, ModuleVc},
    reference_type::{EntryReferenceSubType, ReferenceType},
    source::SourceVc,
};

/// Marker trait for the chunking context to accept evaluated entries.
///
/// The chunking context implementation will resolve the dynamic entry to a
/// well-known value or trait object.
#[turbo_tasks::value_trait]
pub trait EvaluatableAsset: Asset + Module + ChunkableModule {}

#[turbo_tasks::value_impl]
impl EvaluatableAssetVc {
    #[turbo_tasks::function]
    pub async fn from_source(
        source: SourceVc,
        context: AssetContextVc,
    ) -> Result<EvaluatableAssetVc> {
        let asset = context.process(
            source,
            Value::new(ReferenceType::Entry(EntryReferenceSubType::Runtime)),
        );
        let Some(entry) = EvaluatableAssetVc::resolve_from(asset).await? else {
            bail!(
                "{} is not a valid evaluated entry",
                asset.ident().to_string().await?
            )
        };
        Ok(entry)
    }
}

#[turbo_tasks::value(transparent)]
pub struct EvaluatableAssets(Vec<EvaluatableAssetVc>);

#[turbo_tasks::value_impl]
impl EvaluatableAssetsVc {
    #[turbo_tasks::function]
    pub fn empty() -> EvaluatableAssetsVc {
        EvaluatableAssets(vec![]).cell()
    }

    #[turbo_tasks::function]
    pub fn one(entry: EvaluatableAssetVc) -> EvaluatableAssetsVc {
        EvaluatableAssets(vec![entry]).cell()
    }

    #[turbo_tasks::function]
    pub fn many(assets: Vec<EvaluatableAssetVc>) -> EvaluatableAssetsVc {
        EvaluatableAssets(assets).cell()
    }

    #[turbo_tasks::function]
    pub async fn with_entry(self, entry: EvaluatableAssetVc) -> Result<EvaluatableAssetsVc> {
        let mut entries = self.await?.clone_value();
        entries.push(entry);
        Ok(EvaluatableAssets(entries).cell())
    }
}
