# Whole-cell 4D net arrangements

Choose a convex 4D source and select **4D CELL NET** in the derived view. The **Nets** inspector shows the whole-cell controls. **Generate / reset cell net** rotates the source's complete three-dimensional boundary cells about shared polygon faces into a common 3D hyperplane. Each cell retains its source vertices, face cycles and identity. All six included regular convex 4-polytopes are tested, including all 600 tetrahedral cells of the 600-cell.

The default connections form a deterministic tree. **Start with separate cells** makes a forest with one component per cell. Explicit face connections must remain acyclic. Cell intersection checking is not implemented: arranged cells can intersect and are retained intact.

- Click a visible cell face or enter a source face ID and choose **Highlight matching faces** to inspect both copies. Shift-click a vertex, or enter its source ID, to highlight every copy.
- **Cut / join at source face** removes or creates a connection. A cut preserves the current placement. A join aligns the connected cells at the chosen face; a cycle-closing join is rejected.
- **Reattach cell and descendants** changes a non-root cell's parent connection. Enter its moving cell ID and an incident face connecting to the desired parent. Its descendants follow rigidly; a cycle is rejected.
- Choose a connected piece and enter XYZ translations in intrinsic model units and XYZ rotations in degrees. **Apply rigid piece placement** moves the entire component. Rotation acts about its current vertex mean. Mouse dragging of cell components is not implemented.
- **Undo cell edit** and **Redo cell edit** restore up to 100 compact layout states independently of construction history.
- **Surface shrink** contracts the visible surfaces toward each cell's vertex mean. Mathematical cells, outlines and stored placement coordinates retain their original size. It is a viewing aid, not a geometric shrink operation.

The kernel checks every cell's pairwise vertex distances, shared-face joins and the common-hyperplane residual at a tolerance proportional to source span. Tests also cover cuts, joins, reattachment, rigid placements, disconnected layouts, extreme source scales and native round trips. These are approximate numerical checks. Generalized/star 4D domains, collision handling, aesthetic symmetric layouts and full benchmark interaction semantics remain pending.

Projects store source geometry, connection face IDs, root, proper quaternion/translation placements, layout history, source selections and shrink display settings. Cached layout coordinates are regenerated from source geometry and those parameters during validation. Derived cell arrangements never replace the source polytope.
