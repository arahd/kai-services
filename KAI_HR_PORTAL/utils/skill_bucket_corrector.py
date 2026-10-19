"""
Skill Bucket Corrector
Redistributes skills to correct buckets based on verification status and proof.
"""
import logging
logger = logging.getLogger(__name__)


def correct_skill_buckets(matching_result):
    """
    Corrects skill bucket placement based on verification rules.
    
    IMPORTANT: This function handles the common scenario where LLMs place ALL skills 
    in the 'matched' bucket regardless of verification status. It redistributes 
    skills to the correct bucket WITHIN THE SAME TIER.
    
    Rules:
    - matched: verified=True AND proof exists (non-empty list) AND match_score >= 0.5
    - partial: verified=False OR empty proof OR match_score < 0.5
    - not_found: candidate_has is None
    
    Args:
        matching_result (dict): The matching result from LLM with structure:
            {
                'skill_comparison': {
                    'mandatory': {'matched': [...], 'partial': [...], 'not_found': [...]},
                    'preferred': {'matched': [...], 'partial': [...], 'not_found': [...]},
                    'better_to_have': {'matched': [...], 'partial': [...], 'not_found': [...]}
                }
            }
        
    Returns:
        dict: Corrected matching result with skills redistributed to proper buckets
        
    Example:
        Before: mandatory.matched has 10 skills (5 verified, 5 unverified)
        After:  mandatory.matched has 5 verified skills
                mandatory.partial has 5 unverified skills
    """
    if 'skill_comparison' not in matching_result:
        return matching_result
    
    skill_comparison = matching_result['skill_comparison']
    
    # Process each tier independently: mandatory, preferred, better_to_have
    for tier_name in ['mandatory', 'preferred', 'better_to_have']:
        if tier_name not in skill_comparison:
            continue
            
        tier = skill_comparison[tier_name]
        
        # Step 1: Collect ALL skills from all three buckets in this tier
        # (Usually, LLM puts everything in 'matched', so partial/not_found are empty)
        all_skills = []
        all_skills.extend(tier.get('matched', []))
        all_skills.extend(tier.get('partial', []))
        all_skills.extend(tier.get('not_found', []))
        
        # Step 1.5: Deduplicate skills by name (keep the best version)
        # Sometimes LLM returns duplicate skill entries
        unique_skills = {}
        duplicate_count = 0
        
        for skill in all_skills:
            skill_name = skill.get('skill', 'Unknown')
            
            # If skill not seen yet, add it
            if skill_name not in unique_skills:
                unique_skills[skill_name] = skill
            else:
                duplicate_count += 1
                # If duplicate found, keep the one with better attributes
                existing = unique_skills[skill_name]
                existing_candidate = existing.get('candidate_has')
                current_candidate = skill.get('candidate_has')
                
                # PRIORITY 1: Prefer candidate_has=None (truly not found) over fake data (years=0.0)
                # This handles LLM returning same skill in both partial and not_found
                if existing_candidate is None and current_candidate is not None:
                    # Keep existing (None is more correct than fake data)
                    continue
                elif existing_candidate is not None and current_candidate is None:
                    # Replace with current (None is more correct)
                    unique_skills[skill_name] = skill
                    continue
                
                # PRIORITY 2: If both are None or both have data, compare quality
                if current_candidate:
                    current_verified = current_candidate.get('verified', False)
                    current_proof = current_candidate.get('proof', [])
                    current_score = skill.get('match_score', 0.0)
                    current_years = current_candidate.get('years', 0.0)
                else:
                    current_verified = False
                    current_proof = []
                    current_score = 0.0
                    current_years = 0.0
                
                if existing_candidate:
                    existing_verified = existing_candidate.get('verified', False)
                    existing_proof = existing_candidate.get('proof', [])
                    existing_score = existing.get('match_score', 0.0)
                    existing_years = existing_candidate.get('years', 0.0)
                else:
                    existing_verified = False
                    existing_proof = []
                    existing_score = 0.0
                    existing_years = 0.0
                
                # Keep the better one:
                # Priority: verified+proof > verified > years > score > first occurrence
                if (current_verified and current_proof and len(current_proof) > 0 and
                    not (existing_verified and existing_proof and len(existing_proof) > 0)):
                    unique_skills[skill_name] = skill
                elif (current_verified and not existing_verified):
                    unique_skills[skill_name] = skill
                elif (current_verified == existing_verified and (current_years or 0) > (existing_years or 0)):
                    unique_skills[skill_name] = skill
                elif (current_verified == existing_verified and current_years == existing_years and current_score > existing_score):
                    unique_skills[skill_name] = skill
                # else: keep existing
        
        # Convert back to list
        all_skills = list(unique_skills.values())
        
        if duplicate_count > 0:
            logger.debug("[Deduplication] Found %s duplicate(s) in %s tier, kept %s unique skills", duplicate_count, tier_name, len(all_skills))
        
        # Step 2: Initialize new empty buckets for redistribution
        new_matched = []
        new_partial = []
        new_not_found = []
        
        # Step 3: Redistribute EACH skill to the correct bucket based on rules
        for skill in all_skills:
            skill_name = skill.get('skill', 'Unknown')
            candidate_has = skill.get('candidate_has')
            match_score = skill.get('match_score', 0.0)
            
            # RULE 1: No candidate data OR score=0 → not_found
            # if candidate_has is None or match_score == 0.0:
            if candidate_has is None:
                new_not_found.append(skill)
                continue
            
            # RULE 1.5: Fake data detection - years=0.0 AND unverified_reason says "No evidence"
            # This means LLM should have set candidate_has=None but didn't
            years = candidate_has.get('years', 0.0)
            unverified_reason = candidate_has.get('unverified_reason', '')
            
            if years == 0.0 and 'No evidence found' in str(unverified_reason):
                # This is fake data - skill not actually in resume
                skill['candidate_has'] = None
                skill['match_score'] = 0.0
                skill['gap'] = 'No evidence found in any resume section'
                new_not_found.append(skill)
                continue
            
            # Extract verification attributes
            verified = candidate_has.get('verified', False)
            proof = candidate_has.get('proof', [])
            
            # RULE 2: Fully verified with proof and good score → matched
            if verified and proof and len(proof) > 0:
                # Keep in matched - skill meets all criteria
                new_matched.append(skill)
            
            # RULE 3: Unverified OR no proof OR low score → partial
            else:
                # Ensure gap field exists for partial skills (required for reporting)
                if 'gap' not in skill:
                    if not verified:
                        skill['gap'] = 'No evidence found in any resume section'
                    elif not proof or len(proof) == 0:
                        skill['gap'] = 'No evidence found in any resume section'
                    elif match_score < 0.5:
                        years_jd = skill.get('jd_requires', {}).get('years', 0)
                        years_candidate = candidate_has.get('years', 0)
                        years_short = years_jd - years_candidate
                        if years_short > 0:
                            skill['gap'] = f'{years_short:.1f} years short'
                        else:
                            skill['gap'] = 'Proficiency below expected'
                
                # Move to partial - skill doesn't meet matched criteria
                new_partial.append(skill)
        
        # Step 4: Replace old buckets with corrected buckets IN THE SAME TIER
        tier['matched'] = new_matched
        tier['partial'] = new_partial
        tier['not_found'] = new_not_found
    
    return matching_result


def validate_skill_buckets(matching_result):
    """
    Validates that skills are in correct buckets and returns any violations.
    
    Args:
        matching_result (dict): The matching result to validate
        
    Returns:
        list: List of validation errors (empty if all correct)
    """
    errors = []
    
    if 'skill_comparison' not in matching_result:
        return errors
    
    skill_comparison = matching_result['skill_comparison']
    
    for tier_name in ['mandatory', 'preferred', 'better_to_have']:
        if tier_name not in skill_comparison:
            continue
            
        tier = skill_comparison[tier_name]
        
        # Check matched bucket
        for skill in tier.get('matched', []):
            skill_name = skill.get('skill', 'Unknown')
            candidate_has = skill.get('candidate_has')
            
            if candidate_has is None:
                errors.append(f"{tier_name}.matched: '{skill_name}' has candidate_has=None (should be in not_found)")
                continue
                
            verified = candidate_has.get('verified', False)
            proof = candidate_has.get('proof', [])
            match_score = skill.get('match_score', 0.0)
            
            if not verified:
                errors.append(f"{tier_name}.matched: '{skill_name}' has verified=False (should be in partial)")
            
            if not proof or len(proof) == 0:
                errors.append(f"{tier_name}.matched: '{skill_name}' has empty proof (should be in partial)")
            
            if match_score < 0.5:
                errors.append(f"{tier_name}.matched: '{skill_name}' has match_score={match_score} < 0.5 (should be in partial)")
        
        # Check not_found bucket
        for skill in tier.get('not_found', []):
            skill_name = skill.get('skill', 'Unknown')
            candidate_has = skill.get('candidate_has')
            
            if candidate_has is not None:
                errors.append(f"{tier_name}.not_found: '{skill_name}' has candidate_has data (should be in matched or partial)")
    
    return errors


# Example usage
if __name__ == "__main__":
    import json

    # Example matching result (simplified)
    sample_result = {
        'skill_comparison': {
            'mandatory': {
                'matched': [
                    {
                        'skill': 'Java',
                        'candidate_has': {
                            'verified': True,
                            'proof': [{'type': 'work_experience'}]
                        },
                        'match_score': 1.0
                    },
                    {
                        'skill': 'jQuery',
                        'candidate_has': {
                            'verified': False,
                            'proof': []
                        },
                        'match_score': 0.24
                    }
                ],
                'partial': [],
                'not_found': []
            }
        }
    }

    logger.info("Before correction:")
    logger.info(json.dumps(sample_result, indent=2))

    # Validate
    errors = validate_skill_buckets(sample_result)
    if errors:
        logger.warning("Validation errors found:")
        for error in errors:
            logger.warning("- %s", error)

    # Correct
    corrected = correct_skill_buckets(sample_result)

    logger.info("After correction:")
    logger.info(json.dumps(corrected, indent=2))

    # Validate again
    errors = validate_skill_buckets(corrected)
    if errors:
        logger.warning("Validation errors still present:")
        for error in errors:
            logger.warning("- %s", error)
    else:
        logger.info("All skills in correct buckets")
